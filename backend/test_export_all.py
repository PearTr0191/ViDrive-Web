import json, urllib.request, urllib.error

with open('backend/tco_result.json', encoding='utf-8') as f:
    tco = json.load(f)

result = tco['result']
base = {
    "lang": "en",
    "years": tco['years'],
    "city": tco['city'],
    "km": tco['km'],
    "area": tco['area'],
    "ratio": tco['city_ratio'],
    "show_opp": tco['show_opp_cost'],
}


def post(payload):
    body = json.dumps(payload).encode('utf-8')
    r = urllib.request.Request('http://localhost:8000/api/export/pdf', data=body,
                               headers={'Content-Type': 'application/json'}, method='POST')
    try:
        resp = urllib.request.urlopen(r)
        data = resp.read()
        return resp.status, resp.headers.get('Content-Type'), resp.headers.get('Content-Disposition'), len(data)
    except urllib.error.HTTPError as e:
        return e.code, None, None, e.read().decode('utf-8', 'replace')[:500]


# Single PDF
single = dict(base, export_type="single", car_id=tco['car_id'], result=result)
s = post(single)
print('SINGLE PDF -> status=%s type=%s disp=%s bytes=%s' % s)

# Compare PDF (two cars: same result twice to exercise fpdf compare path)
cmp = dict(base, export_type="compare", car_ids=[tco['car_id'], "vf8_2026"],
           results=[result, result])
c = post(cmp)
print('COMPARE PDF -> status=%s type=%s disp=%s bytes=%s' % c)

# CSV
body = json.dumps(dict(base, export_type="single", car_id=tco['car_id'], result=result)).encode('utf-8')
r = urllib.request.Request('http://localhost:8000/api/export/csv', data=body,
                           headers={'Content-Type': 'application/json'}, method='POST')
try:
    resp = urllib.request.urlopen(r)
    data = resp.read()
    print('CSV -> status=%s type=%s disp=%s bytes=%s' % (resp.status, resp.headers.get('Content-Type'), resp.headers.get('Content-Disposition'), len(data)))
except urllib.error.HTTPError as e:
    print('CSV ERROR', e.code, e.read().decode('utf-8', 'replace')[:500])
