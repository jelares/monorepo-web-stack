import json
from datetime import datetime


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({
            "success": True,
            "data": {
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
            },
        }),
    }