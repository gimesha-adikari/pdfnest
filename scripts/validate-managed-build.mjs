const managed = process.env.MANAGED_BUILD === 'true' || ['canary', 'staging', 'production'].includes((process.env.APP_ENV || '').toLowerCase());

if (!managed) {
  process.exit(0);
}

const required = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
];
const missing = required.filter((name) => !(process.env[name] || '').trim());
if (missing.length) {
  console.error(`Managed Next.js build is missing: ${missing.join(', ')}`);
  process.exit(1);
}

for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_APP_URL']) {
  const value = process.env[name].trim();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) {
    console.error(`${name} must not point to localhost or loopback in a managed build`);
    process.exit(1);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      console.error(`${name} must use HTTPS in a managed build`);
      process.exit(1);
    }
  } catch {
    console.error(`${name} must be an absolute HTTPS URL in a managed build`);
    process.exit(1);
  }
}

console.log('Managed frontend build contract validated.');
