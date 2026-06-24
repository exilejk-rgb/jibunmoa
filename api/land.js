export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { addrdetail, numMain, numSub } = req.query;
  if (!addrdetail || !numMain) {
    return res.status(400).json({ error: 'params missing' });
  }

  const JUSO_KEY = 'devU01TX0FVVEgyMDI2MDYyNDE2MjQyOTExOTQ5OTc=';
  const VWORLD_KEY = '017C2FD1-CCDE-3154-95E0-6190E3B00A41';

  try {
    // 1단계: 행안부 주소검색 API (POST 방식 + 한글 인코딩)
    const addrQuery = `${addrdetail} ${numMain}${numSub && numSub !== '0' ? '-' + numSub : ''}`;
    
    const formData = new URLSearchParams();
    formData.append('confmKey', JUSO_KEY);
    formData.append('currentPage', '1');
    formData.append('countPerPage', '1');
    formData.append('keyword', addrQuery);
    formData.append('resultType', 'json');

    const jusoRes = await fetch('https://business.juso.go.kr/addrlink/addrLinkApi.do', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: formData.toString()
    });

    const jusoText = await jusoRes.text();

    if (jusoText.trim().startsWith('<')) {
      return res.status(502).json({ 
        error: 'juso_html', 
        message: '주소 API 오류. 다시 시도해주세요.',
        raw: jusoText.substring(0, 100)
      });
    }

    const jusoData = JSON.parse(jusoText);
    const jusoList = jusoData?.results?.juso;

    if (!jusoList || jusoList.length === 0) {
      return res.status(404).json({ 
        error: 'address_not_found', 
        message: '주소를 찾을 수 없습니다. 시·군·구를 포함해서 입력해주세요.',
        errMsg: jusoData?.results?.common?.errorMessage
      });
    }

    const juso = jusoList[0];
    const admCd    = juso.admCd    || '';
    const bdKdcd   = juso.bdKdcd   || '0';
    const lnbrMnnm = String(juso.lnbrMnnm || numMain).padStart(4, '0');
    const lnbrSlno = String(juso.lnbrSlno || numSub || '0').padStart(4, '0');
    const pnu      = `${admCd}${bdKdcd}${lnbrMnnm}${lnbrSlno}`;
    const fullAddr = juso.jibunAddr || addrQuery;

    if (admCd.length < 10) {
      return res.status(404).json({ error: 'pnu_fail', message: 'PNU 구성 실패', juso });
    }

    // 2단계: vworld 개별공시지가 조회
    let gongsi = 0;
    let jibun  = '대';
    let yongdo = '정보없음';
    let area_m2 = 0;

    try {
      const priceUrl = `https://api.vworld.kr/ned/data/getIndvdLandPriceAttr?key=${VWORLD_KEY}&domain=jibunmoa.vercel.app&pnu=${pnu}&format=json&numOfRows=1`;
      const priceRes  = await fetch(priceUrl);
      const priceText = await priceRes.text();
      if (!priceText.trim().startsWith('<')) {
        const pd = JSON.parse(priceText);
        const item = pd?.indvdLandPrices?.indvdLandPrice?.[0];
        if (item) {
          gongsi = parseFloat(item.pblntfPclnd || 0);
          jibun  = item.lndcgrCodeNm || '대';
          yongdo = item.prposArea1Nm || '정보없음';
        }
      }
    } catch(e) {}

    // 3단계: vworld 토지임야(면적) 조회
    try {
      const landUrl  = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${VWORLD_KEY}&domain=jibunmoa.vercel.app&pnu=${pnu}&format=json&numOfRows=1`;
      const landRes  = await fetch(landUrl);
      const landText = await landRes.text();
      if (!landText.trim().startsWith('<')) {
        const ld = JSON.parse(landText);
        const item = ld?.landCharacteristicss?.landCharacteristic?.[0];
        if (item) {
          area_m2 = parseFloat(item.lndpclAr || 0);
          jibun   = item.lndcgrCodeNm || jibun;
          yongdo  = item.prposArea1Nm || yongdo;
        }
      }
    } catch(e) {}

    const ROAD_JIBUN = ['대','공장용지','학교용지','주차장','주유소용지','창고용지','도로','철도용지'];
    const road_access = ROAD_JIBUN.includes(jibun) ||
      !!(yongdo && (yongdo.includes('상업') || yongdo.includes('주거') || yongdo.includes('공업')));

    return res.status(200).json({
      success: true,
      data: { key: addrQuery, address: fullAddr, area_m2, jibun, yongdo, gongsi, road_access, pnu }
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
