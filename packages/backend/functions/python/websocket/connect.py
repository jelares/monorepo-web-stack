import json


def handler(event, context):
    connection_id = event["requestContext"]["connectionId"]
    print(f"Client connected: {connection_id}")

    # Store connectionId in DynamoDB or your preferred storage

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Connected"}),
    }