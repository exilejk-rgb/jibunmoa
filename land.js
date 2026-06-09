export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { addrdetail, numMain, numSub } = req.query;
  if (!addrdetail || !numMain) {
    return res.status(400).json({ error: 'addrdetail, numMain 필수' });
  }

  const API_KEY = '6BCCB1B5-0A6C-33A1-A7AC-15BE0CCACD63';
  const url = new URL('https://api.vworld.kr/ned/data/getLandCharacteristics');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('domain', 'jibunmoa.vercel.app');
  url.searchParams.set('addrdetail', addrdetail);
  url.searchParams.set('numMain', numMain);
  url.searchParams.set('numSub', numSub || '0');
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
