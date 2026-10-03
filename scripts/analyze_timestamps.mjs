async function run() {
  const res = await fetch('http://localhost:8000/api/v1/dashboard/events');
  const data = await res.json();
  const features = data.features || [];
  console.log('Total features:', features.length);
  const timestamps = features.map(f => f.properties.detected_at).filter(Boolean).sort();
  console.log('Earliest:', timestamps[0]);
  console.log('Latest:', timestamps[timestamps.length - 1]);
  const unique = [...new Set(timestamps)];
  console.log('Unique timestamps count:', unique.length);
  console.log('All unique timestamps:');
  unique.forEach((t, i) => {
    const count = timestamps.filter(x => x === t).length;
    console.log(`  [${i + 1}] ${t} -> ${count} events`);
  });
}
run().catch(console.error);
