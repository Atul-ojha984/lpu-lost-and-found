import urllib.request
import json
import time

BASE_URL = 'https://lpu-lost-found-backend-django-zf75.onrender.com'

endpoints = [
    ('GET', '/', 200, False),
    ('GET', '/api/v1/health', 200, False),
    ('GET', '/api/v1/', 200, False),
    ('GET', '/api/schema/', 200, False),
    ('GET', '/api/docs/', 200, False),
    ('GET', '/api/redoc/', 200, False),
    ('GET', '/api/v1/categories/', 200, False),
    ('GET', '/api/v1/locations/', 200, False),
    ('GET', '/api/v1/items/', 200, False),
    ('GET', '/api/v1/items/daily-lost-report-limit/', 401, True),
    ('GET', '/api/v1/items/my-reports/', 401, True),
    ('GET', '/api/v1/claims/my-claims/', 401, True),
    ('GET', '/api/v1/claims/pending/', 401, True),
    ('GET', '/api/v1/custody/inventory/', 401, True),
    ('GET', '/api/v1/custody/locations/', 401, True),
    ('GET', '/api/v1/custody/lockers/', 401, True),
    ('GET', '/api/v1/handovers/my-recovery-history/', 401, True),
    ('GET', '/api/v1/handovers/pending/', 401, True),
    ('GET', '/api/v1/notifications/', 401, True),
    ('GET', '/api/v1/security/dashboard-stats/', 401, True),
    ('GET', '/api/v1/security/reports/', 401, True),
    ('GET', '/api/v1/security/audit-trail/', 401, True),
    ('GET', '/api/v1/admin/analytics/', 401, True),
    ('GET', '/api/v1/admin/users/', 401, True),
    ('GET', '/api/v1/admin/inventory/', 401, True),
    ('GET', '/api/v1/admin/retention/queue/', 401, True),
    ('GET', '/api/v1/admin/categories/', 401, True),
    ('GET', '/api/v1/admin/locations/', 401, True),
    ('GET', '/api/v1/admin/audit-logs/', 401, True),
    ('POST', '/api/v1/auth/register/', 403, False),
]

print(f"Starting API Endpoint Smoke Test against: {BASE_URL}")
results = []
for method, path, expected_status, auth_required in endpoints:
    url = BASE_URL + path
    req = urllib.request.Request(url, method=method)
    req.add_header('User-Agent', 'QA-Automated-Tester/1.0')
    req.add_header('Accept', 'application/json')
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            status = res.status
            elapsed = int((time.time() - t0) * 1000)
            passed = (status == expected_status)
            results.append((method, path, expected_status, status, elapsed, passed, 'OK'))
            result_label = "PASS" if passed else "FAIL"
            print(f"[{method}] {path:<40} -> HTTP {status} (expected {expected_status}) in {elapsed}ms: {result_label}")
    except urllib.error.HTTPError as e:
        elapsed = int((time.time() - t0) * 1000)
        status = e.code
        passed = (status == expected_status)
        results.append((method, path, expected_status, status, elapsed, passed, e.reason))
        result_label = "PASS" if passed else "FAIL"
        print(f"[{method}] {path:<40} -> HTTP {status} (expected {expected_status}) in {elapsed}ms: {result_label}")
    except Exception as exc:
        elapsed = int((time.time() - t0) * 1000)
        results.append((method, path, expected_status, 0, elapsed, False, str(exc)))
        print(f"[{method}] {path:<40} -> ERROR: {exc}")

total = len(results)
passed_count = sum(1 for r in results if r[5])
print(f"\n==========================================")
print(f"API Smoke Test Summary: {passed_count}/{total} PASSED")
print(f"==========================================")
