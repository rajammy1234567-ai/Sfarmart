// Authentication failures must not cause a second login POST or a refresh attempt.
export async function requestCustomerLogin(client, phone, password, deviceId) {
  const response = await client.post('/auth/customer/login', { phone, password, deviceId }, {
    timeout: 60000,
    headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' }
  });
  const data = response?.data;
  if (data?.success || data?.ok) {
    const token = data.accessToken || data.token;
    if (typeof token !== 'string' || !token || !data.user || !(data.user._id || data.user.id)) {
      throw Object.assign(new Error('The server returned an incomplete sign-in response. Please contact support.'), { code: 'INVALID_RESPONSE' });
    }
  }
  return response;
}
