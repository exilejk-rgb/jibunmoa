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
    // 1단계: 행안부 주소검색 API → PNU 획득
    const addrQuery = `${addrdetail} ${numMain}${numSub && numSub !== '0' ? '-' + numSub : ''}`;
    const jusoUrl = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do');
    jusoUrl.searchParams.set('confmKey', JUSO_KEY);
    jusoUrl.searchParams.set('currentPage', '1');
    jusoUrl.searchParams.set('countPerPage', '1');
    jusoUrl.searchParams.set('keyword', addrQuery);
    jusoUrl.searchParams.set('resultType', 'json');

    const jusoRes = await fetch(jusoUrl.toString());
    const jusoText = await jusoRes.text();

    if (jusoText.trim().startsWith('<')) {
      return res.status(502).json({ error: 'juso_html', message: '주소 API HTML 반환' });
    }

    const jusoData = JSON.parse(jusoText);
    const jusoResult = jusoData?.results?.juso;

    if (!jusoResult || jusoResult.length === 0) {
      return res.status(404).json({ error: 'address_not_found', message: '주소를 찾을 수 없습니다. 시·군·구를 포함해서 입력해주세요.' });
    }

    const juso = jusoResult[0];
    // admCd(행정코드10자리) + 산여부(1) + lnbrMnnm(본번4자리) + lnbrSlno(부번4자리) = PNU 19자리
    const admCd = juso.admCd || '';
    const bdKdcd = juso.bdKdcd || '0'; // 0:일반, 1:산
    const lnbrMnnm = (juso.lnbrMnnm || numMain).padStart(4, '0');
    const lnbrSlno = (juso.lnbrSlno || numSub || '0').padStart(4, '0');
    const pnu = `${admCd}${bdKdcd}${lnbrMnnm}${lnbrSlno}`;

    if (admCd.length < 10) {
      return res.status(404).json({ error: 'pnu_fail', message: 'PNU 구성 실패', juso });
    }

    // 주소 정보 파싱
    const area_m2 = parseFloat(juso.buldMnnm || 0);
    const fullAddr = juso.jibunAddr || addrQuery;

    // 2단계: vworld 개별공시지가 조회
    const priceUrl = new URL('https://api.vworld.kr/ned/data/getIndvdLandPriceAttr');
    priceUrl.searchParams.set('key', VWORLD_KEY);
    priceUrl.searchParams.set('domain', 'jibunmoa.vercel.app');
    priceUrl.searchParams.set('pnu', pnu);
    priceUrl.searchParams.set('format', 'json');
    priceUrl.searchParams.set('numOfRows', '1');

    const priceRes = await fetch(priceUrl.toString());
    const priceText = await priceRes.text();

    let priceData = null;
    let gongsi = 0;
    let jibun = '대';
    let yongdo = '정보없음';

    if (!priceText.trim().startsWith('<')) {
      try {
        priceData = JSON.parse(priceText);
        const item = priceData?.indvdLandPrices?.indvdLandPrice?.[0];
        if (item) {
          gongsi = parseFloat(item.pblntfPclnd || 0);
          jibun = item.lndcgrCodeNm || '대';
          yongdo = item.prposArea1Nm || '정보없음';
        }
      } catch(e) {}
    }

    // 3단계: 토지임야정보로 면적 조회 (vworld)
    const landUrl = new URL('https://api.vworld.kr/ned/data/getLandCharacteristics');
    landUrl.searchParams.set('key', VWORLD_KEY);
    landUrl.searchParams.set('domain', 'jibunmoa.vercel.app');
    landUrl.searchParams.set('pnu', pnu);
    landUrl.searchParams.set('format', 'json');
    landUrl.searchParams.set('numOfRows', '1');

    let finalArea = 0;
    try {
      const landRes = await fetch(landUrl.toString());
      const landText = await landRes.text();
      if (!landText.trim().startsWith('<')) {
        const landData = JSON.parse(landText);
        const landItem = landData?.landCharacteristicss?.landCharacteristic?.[0];
        if (landItem) {
          finalArea = parseFloat(landItem.lndpclAr || 0);
          jibun = landItem.lndcgrCodeNm || jibun;
          yongdo = landItem.prposArea1Nm || yongdo;
        }
      }
    } catch(e) {}

    // 도로 접면 여부 추정
    const ROAD_JIBUN = ['대','공장용지','학교용지','주차장','주유소용지','창고용지','도로','철도용지'];
    const road_access = ROAD_JIBUN.includes(jibun) ||
      (yongdo && (yongdo.includes('상업') || yongdo.includes('주거') || yongdo.includes('공업')));

    return res.status(200).json({
      success: true,
      data: {
        key: addrQuery,
        address: fullAddr,
        area_m2: finalArea,
        jibun,
        yongdo,
        gongsi,
        road_access,
        pnu,
      }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
