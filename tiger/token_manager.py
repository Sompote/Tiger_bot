"""
Tiger Bot - Token Management System
Rate limiting, multi-key rotation, and circuit breaker
"""
import time
import random
import sqlite3
import yaml
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import logging

logger = logging.getLogger(__name__)

class TokenBucket:
    """Token bucket algorithm for rate limiting"""
    
    def __init__(self, rate: int = 60, per: int = 60):
        self.rate = rate  # requests allowed
        self.per = per    # per seconds
        self.allowance = rate
        self.last_check = time.time()
        self.lock = False
    
    def consume(self, tokens: int = 1) -> bool:
        now = time.time()
        time_passed = now - self.last_check
        self.last_check = now
        
        self.allowance += time_passed * (self.rate / self.per)
        self.allowance = min(self.allowance, self.rate)
        
        if self.allowance >= tokens:
            self.allowance -= tokens
            return True
        return False
    
    def get_wait_time(self, tokens: int = 1) -> float:
        if self.allowance >= tokens:
            return 0
        needed = tokens - self.allowance
        return needed * (self.per / self.rate)


class CircuitBreaker:
    """Circuit breaker pattern for API resilience"""
    
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failures = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
    
    def call(self, func, *args, **kwargs):
        if self.state == "OPEN":
            if self._should_attempt_reset():
                self.state = "HALF_OPEN"
            else:
                raise CircuitOpenError("Circuit breaker is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise e
    
    def _on_success(self):
        self.failures = 0
        self.state = "CLOSED"
    
    def _on_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        if self.failures >= self.failure_threshold:
            self.state = "OPEN"
    
    def _should_attempt_reset(self) -> bool:
        if not self.last_failure_time:
            return True
        return (time.time() - self.last_failure_time) >= self.timeout
    
    def is_open(self) -> bool:
        if self.state == "OPEN":
            if self._should_attempt_reset():
                self.state = "HALF_OPEN"
                return False
            return True
        return False


class CircuitOpenError(Exception):
    pass


class TokenManager:
    """Main token management class with rotation and rate limiting"""
    
    def __init__(self, api_name: str, db_path: str = "~/.tiger/memory/token_usage.db"):
        self.api_name = api_name
        self.db_path = os.path.expanduser(db_path)
        self.config = self._load_config()
        self.bucket = TokenBucket(
            rate=self.config.get("rpm_limit", 60),
            per=60
        )
        self.circuit_breaker = CircuitBreaker()
        self.keys = self._load_keys()
        self.current_key_index = 0
        self._init_db()
    
    def _load_config(self) -> Dict:
        config_path = os.path.join(os.path.dirname(__file__), "config", "tokens.yaml")
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config = yaml.safe_load(f)
                return config.get(self.api_name, {})
        return {"rpm_limit": 60, "rpd_limit": 1000}
    
    def _load_keys(self) -> List[str]:
        keys = self.config.get("keys", [])
        if not keys:
            env_key = os.getenv(f"{self.api_name.upper()}_API_KEY")
            if env_key:
                keys = [env_key]
        return keys
    
    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS token_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    api_name TEXT NOT NULL,
                    key_id TEXT,
                    request_count INTEGER DEFAULT 1,
                    tokens_used INTEGER DEFAULT 0,
                    response_time_ms INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN DEFAULT 1
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_api_timestamp 
                ON token_usage(api_name, timestamp)
            """)
    
    def get_current_key(self) -> Optional[str]:
        if not self.keys:
            return None
        strategy = self.config.get("strategy", "round_robin")
        
        if strategy == "round_robin":
            key = self.keys[self.current_key_index]
            self.current_key_index = (self.current_key_index + 1) % len(self.keys)
            return key
        elif strategy == "least_used":
            return self._get_least_used_key()
        
        return self.keys[0]
    
    def _get_least_used_key(self) -> str:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT key_id, SUM(request_count) as total
                FROM token_usage
                WHERE api_name = ? AND timestamp > datetime('now', '-1 day')
                GROUP BY key_id
            """, (self.api_name,))
            usage = {row[0]: row[1] for row in cursor.fetchall()}
        
        # Find key with least usage
        min_usage = float('inf')
        selected_key = self.keys[0]
        for key in self.keys:
            key_id = f"key_{self.keys.index(key)}"
            if usage.get(key_id, 0) < min_usage:
                min_usage = usage.get(key_id, 0)
                selected_key = key
        
        return selected_key
    
    def allow_request(self) -> bool:
        if self.circuit_breaker.is_open():
            return False
        return self.bucket.consume()
    
    def get_wait_time(self) -> float:
        return self.bucket.get_wait_time()
    
    def record_usage(self, tokens_used: int = 0, response_time_ms: int = 0, success: bool = True):
        key_id = f"key_{self.current_key_index}" if self.keys else "default"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO token_usage 
                (api_name, key_id, tokens_used, response_time_ms, success)
                VALUES (?, ?, ?, ?, ?)
            """, (self.api_name, key_id, tokens_used, response_time_ms, int(success)))
    
    def get_usage_stats(self) -> Dict:
        with sqlite3.connect(self.db_path) as conn:
            # Last minute usage
            cursor = conn.execute("""
                SELECT SUM(request_count) 
                FROM token_usage 
                WHERE api_name = ? AND timestamp > datetime('now', '-1 minute')
            """, (self.api_name,))
            rpm = cursor.fetchone()[0] or 0
            
            # Last day usage
            cursor = conn.execute("""
                SELECT SUM(request_count) 
                FROM token_usage 
                WHERE api_name = ? AND timestamp > datetime('now', '-1 day')
            """, (self.api_name,))
            rpd = cursor.fetchone()[0] or 0
            
            # Success rate
            cursor = conn.execute("""
                SELECT 
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
                    COUNT(*)
                FROM token_usage 
                WHERE api_name = ? AND timestamp > datetime('now', '-1 hour')
            """, (self.api_name,))
            row = cursor.fetchone()
            success_rate = row[0] if row and row[1] > 0 else 100
        
        return {
            "rpm": rpm,
            "rpm_limit": self.config.get("rpm_limit", 60),
            "rpd": rpd,
            "rpd_limit": self.config.get("rpd_limit", 1000),
            "success_rate": round(success_rate, 1),
            "active_keys": len(self.keys),
            "circuit_state": self.circuit_breaker.state
        }


def api_call_with_retry(func, max_retries: int = 3, backoff_factor: float = 1.0):
    """Exponential backoff retry decorator"""
    def wrapper(*args, **kwargs):
        last_exception = None
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < max_retries - 1:
                    wait = (backoff_factor * (2 ** attempt)) + random.uniform(0, 1)
                    logger.warning(f"Retry {attempt + 1}/{max_retries} after {wait:.1f}s: {e}")
                    time.sleep(wait)
        raise last_exception
    return wrapper
