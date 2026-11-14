import urllib.request
import urllib.error
import json

BASE_URL = "https://lpu-lost-found-backend-django-zf75.onrender.com/api/v1"

def test_login(email_or_reg, password):
    url = f"{BASE_URL}/auth/login/"
    payload = json.dumps({"emailOrRegNo": email_or_reg, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "E2E-Tester"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[SUCCESS] Login for {email_or_reg}: HTTP {resp.status}")
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"[FAILED] Login for {email_or_reg}: HTTP {e.code} - {body}")
        return None
    except Exception as e:
        print(f"[ERROR] Login for {email_or_reg}: {e}")
        return None

if __name__ == "__main__":
    print("Testing Student Login...")
    test_login("student@lpu.co.in", "Student@12345")
    test_login("12101234", "Student@12345")

    print("\nTesting Admin Login...")
    test_login("admin@lpu.co.in", "Admin@12345")
    test_login("LPU-ADM-001", "Admin@12345")

    print("\nTesting Security Officer Login...")
    test_login("security@lpu.co.in", "Security@12345")
    test_login("LPU-SEC-001", "Security@12345")
