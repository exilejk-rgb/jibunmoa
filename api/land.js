export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { addrdetail, numMain, numSub } = req.query;
  if (!addrdetail || !numMain) {
    return res.status(400).json({ error: 'params missing' });
  }

  const API_KEY = '017C2FD1-CCDE-3154-95E0-6190E3B00A41';

  try {
    // 1단계: 지번주소 → PNU 변환
    const addrQuery = `${addrdetail} ${numMain}${numSub && numSub !== '0' ? '-' + numSub : ''}`;
    const addrUrl = new URL('https://api.vworld.kr/req/address');
    addrUrl.searchParams.set('service', 'address');
    addrUrl.searchParams.set('request', 'getcoord');
    addrUrl.searchParams.set('version', '2.0');
    addrUrl.searchParams.set('crs', 'epsg:4326');
    addrUrl.searchParams.set('address', addrQuery);
    addrUrl.searchParams.set('refine', 'true');
    addrUrl.searchParams.set('simple', 'false');
    addrUrl.searchParams.set('format', 'json');
    addrUrl.searchParams.set('type', 'parcel');
    addrUrl.searchParams.set('key', API_KEY);

    const addrRes = await fetch(addrUrl.toString(), {
      headers: { 'Referer': 'https://jibunmoa.vercel.app/', 'User-Agent': 'Mozilla/5.0' }
    });
    const addrText = await addrRes.text();

    if (addrText.trim().startsWith('<')) {
      return res.status(502).json({ error: 'vworld_html', message: '주소검색 API HTML 반환' });
    }

    const addrData = JSON.parse(addrText);

    if (!addrData?.response?.result || addrData?.response?.status !== 'OK') {
      return res.status(404).json({ error: 'address_not_found', message: '주소를 찾을 수 없습니다. 시·군·구를 포함해서 입력해주세요.' });
    }

    const addrResult = addrData.response.result;
    const pnu = addrResult?.zipcode || addrResult?.id;

    if (!pnu) {
      return res.status(404).json({ error: 'pnu_not_found', message: 'PNU 추출 실패', addrResult });
    }

    // 2단계: PNU → 개별공시지가 조회
    const priceUrl = new URL('https://api.vworld.kr/ned/data/getIndvdLandPriceAttr');
    priceUrl.searchParams.set('key', API_KEY);
    priceUrl.searchParams.set('domain', 'jibunmoa.vercel.app');
    priceUrl.searchParams.set('pnu', pnu);
    priceUrl.searchParams.set('format', 'json');
    priceUrl.searchParams.set('numOfRows', '1');

    const priceRes = await fetch(priceUrl.toString(), {
      headers: { 'Referer': 'https://jibunmoa.vercel.app/', 'User-Agent': 'Mozilla/5.0' }
    });
    const priceText = await priceRes.text();

    if (priceText.trim().startsWith('<')) {
      return res.status(502).json({ error: 'price_html', message: '공시지가 API HTML 반환', pnu });
    }

    const priceData = JSON.parse(priceText);
    return res.status(200).json({ ...priceData, _address: addrResult, _pnu: pnu });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
