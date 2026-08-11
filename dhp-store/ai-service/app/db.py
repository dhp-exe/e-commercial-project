import os
import pymysql

def get_db_connection():
    """
    Returns a new pymysql connection using environment variables.
    """
    ssl_args = None
    if os.getenv("DB_SSL", "").lower() == "true":
        ssl_args = {"ssl_verify_cert": True}
        
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        database=os.getenv("DB_NAME"),
        cursorclass=pymysql.cursors.DictCursor,
        ssl=ssl_args
    )
