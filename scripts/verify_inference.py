import urllib.request
import json
import urllib.error

events = [1, 2, 3, 4, 5]
for eid in events:
    url = f"http://127.0.0.1:8000/api/v1/classification/predict/{eid}"
    req = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Event {eid}: {response.getcode()}")
            data = json.loads(response.read().decode())
            print(f"  Class: {data['predicted_class']}")
            print(f"  Probability: {data['model_probability']}")
            print(f"  Version: {data['model_version']}")
    except urllib.error.HTTPError as e:
        print(f"Event {eid}: {e.code}")
        print(f"  Error: {e.read().decode()}")
