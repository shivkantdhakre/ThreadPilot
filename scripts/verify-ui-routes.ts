async function main() {
  console.log('Testing frontend Next.js routes response codes...');
  
  const routes = ['/', '/login', '/register', '/dashboard', '/replies', '/settings'];
  for (const route of routes) {
    const res = await fetch(`http://localhost:3000${route}`);
    console.log(`Route http://localhost:3000${route} -> Status: ${res.status}`);
    if (res.status >= 500) {
      throw new Error(`Route ${route} failed with status ${res.status}`);
    }
  }

  console.log('✓ All frontend route endpoints return valid HTTP statuses without server errors (500)!');
}

main().catch(err => {
  console.error('Frontend route check failed:', err);
  process.exit(1);
});
