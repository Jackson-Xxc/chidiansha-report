export const locationErrorMessage = error => ({
  1: '定位权限被拒绝。请在浏览器的网站权限中允许位置，并在手机系统设置中允许浏览器使用位置。',
  2: '设备暂时无法提供位置。请开启手机定位服务，确认浏览器的位置权限，或换一个浏览器重试。',
  3: '定位超时。请确认手机定位服务已开启，在信号较好的位置重试，也可以直接在外卖平台选地址。',
  insecure: '请使用 HTTPS 正式网址打开网站后再定位。',
  unsupported: '这个浏览器未提供网页定位功能，请换用其他浏览器或直接在外卖平台选地址。',
})[error?.code] || '定位未成功，请检查手机定位服务与浏览器权限，或直接在外卖平台选地址。';

export async function getBrowserLocation(geolocation, secureContext = true) {
  if (!secureContext) throw {code: 'insecure'};
  if (!geolocation?.getCurrentPosition) throw {code: 'unsupported'};
  const request = options => new Promise((resolve, reject) => {
    try {
      geolocation.getCurrentPosition(resolve, reject, options);
    } catch (error) {
      reject({code: error?.name === 'SecurityError' ? 1 : error?.code});
    }
  });
  try {
    return await request({enableHighAccuracy: false, timeout: 10000, maximumAge: 120000});
  } catch (error) {
    // A denial must never trigger another prompt. Retry only unavailable/timeout results.
    if (error.code !== 2 && error.code !== 3) throw error;
    return request({enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
  }
}
