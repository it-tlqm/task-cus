async function check() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'canbo_b', password: 'demo123' }),
  });
  const { token, user } = await loginRes.json();
  console.log('User B:', user);

  const res = await fetch('http://localhost:3000/api/plans', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const plans = json.data || [];
  console.log(`canbo_b nhìn thấy ${plans.length} kế hoạch:`);
  plans.slice(0, 10).forEach((p: any, idx: number) => {
    console.log(`[${idx}] ID: ${p.id} | Title: "${p.title}" | Status: ${p.status} | Items: ${p.items?.length}`);
  });
}
check().catch(console.error);
