import os
import redis

def get_redis_client():
    """
    Returns a Redis client using the REDIS_URL environment variable.
    If REDIS_URL is not set, returns None.
    """
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
        
    return redis.Redis.from_url(redis_url, decode_responses=True)
