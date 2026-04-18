from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from store import Store
from pprint import pprint
import secrets
import os
import json


router = APIRouter(prefix="/webhooks",tags=["chaster"])
store = Store()
security = HTTPBasic()

def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    expected_user = os.getenv("CHASTER_WEBHOOK_USER", "sereti")
    expected_pwd = os.getenv("CHASTER_WEBHOOK_PWD", "password")
    
    correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"), 
        expected_user.encode("utf8")
    )
    correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"), 
        expected_pwd.encode("utf8")
    )
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@router.post("/chaster", tags=["chaster"])
async def read_chaster_webhook(
    request: Request, 
    username: str = Depends(verify_credentials)
):
    print("----- PAYLOAD -----")
    data = await request.json()
    pprint(data)

    with open("assets/chaster_webhook.json", "w") as outfile:
        json.dump(data, outfile, indent=4)

    event: str = data["event"]
    webhookId: str = data["requestId"]

    print(f"event '{event}'")
    print(f"webhookId '{webhookId}'")
    print("-------------")
    
    if event == "action_log.created":
        actionPayload: dict = data["data"]["actionLog"]
        actionType: str = actionPayload["type"]

        print(f"actionType '{actionType}'")
        
        if actionType == "keyholder_trusted":
            print("lock trusted")

        if actionType == "lock_frozen":
            print("lock frozen")

        if actionType == "wheel_of_fortune_turned":
            print("wheel of fortune turned")

            payload: dict = actionPayload["payload"]
            segment: dict = payload["segment"]

            if segment["type"] == "add-time":
                print("add time")
            elif segment["type"] == "set-unfreeze":
                print("set unfreeze")
            elif segment["type"] == "set-freeze":
                print("set freeze")
            elif segment["type"] == "pillory":
                print("pillory")
            elif segment["type"] == "remove-time":
                print("remove time")
            elif segment["type"] == "text":
                payloadText: str = segment["text"]
                print(f"payloadText '{payloadText}'")

            print(f"segmentType '{segment["type"]}'")

        if actionType == "extension_updated":
            print("extension updated")



    return {"status": "ok"}
    