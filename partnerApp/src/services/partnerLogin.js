// Login is a single POST: never automatically replay credentials on timeout.
export function loginErrorMessage(error) {
  if (error?.code === 'ETIMEDOUT') return 'Sign-in timed out. Please try again. The server may be waking up.';
  if (error?.code === 'INVALID_RESPONSE') return 'The server returned an unreadable response. Please try again or contact support.';
  if (error?.status === 429) return 'Too many sign-in attempts. Please wait before trying again.';
  if ([502, 503, 504].includes(error?.status)) return 'The service is temporarily unavailable. Please try again shortly.';
  return 'Could not connect to the server. Check your internet connection and try again.';
}

export async function requestPartnerLogin(baseUrl, phone, password, request) {
  const response = await request(`${baseUrl}/auth/vendor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'identity' },
    body: JSON.stringify({ phone, password })
  }, { timeoutMs: 60000 });
  const data = await response.json();
  if (!response.ok) {
    return { success: false, message: typeof data?.message === 'string' ? data.message :
      [401, 403].includes(response.status) ? 'Sign-in was rejected. Check your credentials and account approval.' :
      'Sign-in failed. Please try again or contact support.' };
  }
  if (data?.success !== true) return { success: false, message: typeof data?.message === 'string' ? data.message : 'Sign-in failed. Check your credentials.' };
  if (!data.vendor?._id || typeof data.token !== 'string' || !data.token) {
    throw Object.assign(new Error('Incomplete login response'), { code: 'INVALID_RESPONSE' });
  }
  return data;
}

export async function requestPartnerRegister(baseUrl, registrationData, request) {
  const {
    ownerName,
    phone,
    password,
    storeName,
    storeType,
    address,
    coordinates
  } = registrationData || {};

  const response = await request(`${baseUrl}/auth/vendor/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'identity' },
    body: JSON.stringify({
      ownerName,
      phone,
      password,
      storeName,
      storeType,
      address,
      coordinates
    })
  }, { timeoutMs: 60000 });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 409) {
      return {
        success: false,
        code: 'PHONE_ALREADY_REGISTERED',
        message: typeof data?.message === 'string' ? data.message : 'This mobile number is already registered as a partner store.'
      };
    }
    return {
      success: false,
      code: data?.code || 'REGISTRATION_REJECTED',
      message: typeof data?.message === 'string' ? data.message : 'Partner registration could not be submitted. Please check the details and try again.'
    };
  }

  if (data?.success !== true && data?.ok !== true) {
    return {
      success: false,
      code: data?.code || 'REGISTRATION_FAILED',
      message: typeof data?.message === 'string' ? data.message : 'Registration failed. Please check your information.'
    };
  }

  return {
    success: true,
    pendingApproval: true,
    code: data?.code || 'REGISTRATION_PENDING_APPROVAL',
    message: typeof data?.message === 'string' ? data.message : 'Registration submitted successfully. Your account is pending admin approval.',
    vendor: data?.vendor || null
  };
}
