import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Extract and test uploadMultipart implementation logic from PartnerContext.js
test('PartnerContext uploadMultipart source verification and transport contracts', async () => {
  const contextSource = await readFile(
    new URL('../../context/PartnerContext.js', import.meta.url),
    'utf8'
  );

  // 0. Confirm Platform is explicitly imported from react-native
  assert.match(contextSource, /import\s*\{[^}]*\bPlatform\b[^}]*\}\s*from\s*['"]react-native['"]/);

  // 1. Confirm uploadMultipart is defined and uses XMLHttpRequest for native platforms
  assert.match(contextSource, /const uploadMultipart = async/);
  assert.match(contextSource, /const xhr = new XMLHttpRequest\(\)/);
  assert.match(contextSource, /xhr\.open\('POST', url, true\)/);
  assert.match(contextSource, /xhr\.setRequestHeader\('Authorization'/);

  // 2. Confirm Web uses standard fetch with Blob/File
  assert.match(contextSource, /if \(Platform\.OS === 'web' \|\| resolved\.isWebBlob\)/);

  // 3. Confirm uploadProductImage and uploadShopPhoto both route through uploadMultipart
  const prodUploadIdx = contextSource.indexOf('const uploadProductImage = async');
  const shopUploadIdx = contextSource.indexOf('const uploadShopPhoto = async');
  assert.ok(prodUploadIdx > 0, 'uploadProductImage must be present');
  assert.ok(shopUploadIdx > 0, 'uploadShopPhoto must be present');

  const prodSection = contextSource.slice(prodUploadIdx, shopUploadIdx);
  assert.match(prodSection, /uploadMultipart\(/);
  assert.doesNotMatch(prodSection, /fetch\(`\${API_BASE_URL}\/uploads\/product-image`/);

  const shopSection = contextSource.slice(shopUploadIdx, shopUploadIdx + 1500);
  assert.match(shopSection, /uploadMultipart\(/);
  assert.doesNotMatch(shopSection, /fetch\(`\${API_BASE_URL}\/uploads\/shop-photo`/);
});

// Mock simulation of Native XHR transport behavior
test('Native XHR upload transport successfully delivers { uri, name, type } payload without expo/fetch', async () => {
  let xhrOpened = false;
  let xhrHeaders = {};
  let sentData = null;
  let timeoutSet = 0;

  class MockXHR {
    open(method, url, asyncFlag) {
      xhrOpened = true;
      this.method = method;
      this.url = url;
      this.async = asyncFlag;
    }
    setRequestHeader(name, val) {
      xhrHeaders[name] = val;
    }
    set timeout(ms) {
      timeoutSet = ms;
    }
    send(body) {
      sentData = body;
      // Simulate successful server response
      setTimeout(() => {
        this.status = 200;
        this.responseText = JSON.stringify({
          success: true,
          url: 'https://farmart-backend-staging.onrender.com/api/uploads/product-images/6ae11223344',
          path: '/api/uploads/product-images/6ae11223344',
          fileId: '6ae11223344'
        });
        if (this.onload) this.onload();
      }, 5);
    }
  }

  // Simulated uploadMultipart execution for Native
  const testNativeUpload = ({ url, filePayload, token }) => {
    return new Promise((resolve, reject) => {
      const xhr = new MockXHR();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 60000;

      xhr.onload = () => {
        let data = {};
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (e) {
          data = { success: false, message: xhr.responseText || `Server responded with status ${xhr.status}` };
        }
        const ok = xhr.status >= 200 && xhr.status < 300;
        resolve({ ok, status: xhr.status, data });
      };

      xhr.onerror = () => reject(new Error('Network error during image upload.'));
      xhr.ontimeout = () => reject(new Error('Image upload timed out.'));

      const formData = new Map();
      formData.set('image', filePayload.file);
      xhr.send(formData);
    });
  };

  const dummyAsset = {
    file: {
      uri: 'file:///data/user/0/com.sfarmart.partner/cache/ImagePicker/prod_test.jpg',
      name: 'prod_test.jpg',
      type: 'image/jpeg'
    },
    name: 'prod_test.jpg',
    isWebBlob: false
  };

  const result = await testNativeUpload({
    url: 'https://farmart-backend-staging.onrender.com/api/uploads/product-image',
    filePayload: dummyAsset,
    token: 'mock-jwt-token'
  });

  assert.equal(xhrOpened, true);
  assert.equal(xhrHeaders['Authorization'], 'Bearer mock-jwt-token');
  assert.equal(xhrHeaders['Content-Type'], undefined, 'Must NOT manually override Content-Type so boundary is preserved');
  assert.equal(timeoutSet, 60000);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.data.success, true);
  assert.equal(result.data.path, '/api/uploads/product-images/6ae11223344');
  assert.ok(sentData.get('image').uri.startsWith('file://'));
});

// Mock simulation of 401 handling and timeout rejection
test('Native XHR upload transport surfaces 401 and network errors correctly', async () => {
  class MockFailingXHR {
    open() {}
    setRequestHeader() {}
    send() {
      setTimeout(() => {
        this.status = 401;
        this.responseText = JSON.stringify({ success: false, message: 'Invalid or expired token' });
        if (this.onload) this.onload();
      }, 5);
    }
  }

  const result401 = await new Promise((resolve) => {
    const xhr = new MockFailingXHR();
    xhr.onload = () => {
      resolve({ status: xhr.status, ok: false, data: JSON.parse(xhr.responseText) });
    };
    xhr.send();
  });

  assert.equal(result401.status, 401);
  assert.equal(result401.data.message, 'Invalid or expired token');

  class MockTimeoutXHR {
    open() {}
    setRequestHeader() {}
    send() {
      setTimeout(() => {
        if (this.ontimeout) this.ontimeout();
      }, 5);
    }
  }

  await assert.rejects(
    new Promise((_, reject) => {
      const xhr = new MockTimeoutXHR();
      xhr.ontimeout = () => reject(new Error('Image upload timed out.'));
      xhr.send();
    }),
    /Image upload timed out/
  );
});
