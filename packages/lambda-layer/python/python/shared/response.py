import json
from typing import Any

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}


def success(data: Any, status_code: int = 200) -> dict:
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps({"success": True, "data": data}),
    }


def error(message: str, status_code: int = 500) -> dict:
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps({"success": False, "error": {"message": message}}),
    }


def not_found(message: str = "Not found") -> dict:
    return error(message, 404)