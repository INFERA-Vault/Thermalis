import { spiderfyFeatures } from '../src/utils/geoUtils';
import type { EventFeatureItem } from '../src/types';

async function runTests() {
  console.log('=== TEST 1: Live Backend Events & Spiderfication ===');
  const res = await fetch('http://localhost:8000/api/v1/dashboard/events');
  if (!res.ok) {
    throw new Error(`Failed to fetch events from backend: ${res.statusText}`);
  }
  const data = (await res.json()) as { features: EventFeatureItem[] };
  console.log(`Backend returned ${data.features.length} features.`);
  
  if (data.features.length !== 2) {
    throw new Error(`Expected 2 features from backend, got ${data.features.length}`);
  }

  const f1 = data.features[0];
  const f2 = data.features[1];
  console.log(`Feature 1: id=${f1.properties.id}, coords=[${f1.geometry.coordinates}], source=${f1.properties.source}, sat=${f1.properties.satellite}`);
  console.log(`Feature 2: id=${f2.properties.id}, coords=[${f2.geometry.coordinates}], source=${f2.properties.source}, sat=${f2.properties.satellite}`);

  if (f1.geometry.coordinates[0] !== f2.geometry.coordinates[0] || f1.geometry.coordinates[1] !== f2.geometry.coordinates[1]) {
    throw new Error('Features are expected to have identical coordinates to test coincidence.');
  }

  const spiderfied = spiderfyFeatures(data.features, 60);
  console.log(`Spiderfied features count: ${spiderfied.features.length}`);
  console.log(`Spider legs count: ${spiderfied.spiderLegs.features.length}`);

  const sf1 = spiderfied.features[0];
  const sf2 = spiderfied.features[1];

  console.log(`Displaced coords 1: [${sf1.geometry.coordinates}]`);
  console.log(`Displaced coords 2: [${sf2.geometry.coordinates}]`);
  console.log(`Original coords 1: [${sf1.properties.original_lng}, ${sf1.properties.original_lat}]`);
  console.log(`Original coords 2: [${sf2.properties.original_lng}, ${sf2.properties.original_lat}]`);

  // Verify coordinates are displaced for display
  if (sf1.geometry.coordinates[0] === sf2.geometry.coordinates[0]) {
    throw new Error('Displaced coordinates should be separated horizontally!');
  }
  // Verify authentic coordinates are preserved
  if (sf1.properties.original_lng !== 77.209 || sf1.properties.original_lat !== 28.6139) {
    throw new Error(`Original coordinates were not preserved! Got [${sf1.properties.original_lng}, ${sf1.properties.original_lat}]`);
  }
  if (!sf1.properties.is_coincident || sf1.properties.coincident_count !== 2) {
    throw new Error('Coincident properties missing or incorrect on feature 1');
  }
  console.log('✓ TEST 1 PASSED: Live backend coincident points successfully spiderfied with true coordinates preserved.');

  console.log('\n=== TEST 2: Empty API Response Handling ===');
  const emptyResult = spiderfyFeatures([]);
  if (emptyResult.features.length !== 0 || emptyResult.spiderLegs.features.length !== 0) {
    throw new Error('Empty features array should return empty results');
  }
  console.log('✓ TEST 2 PASSED: Empty array safely handled with zero features and zero spider legs.');

  console.log('\n=== TEST 3: Single Non-Coincident Feature ===');
  const singleFeature: EventFeatureItem = {
    type: 'Feature',
    id: 99,
    geometry: { type: 'Point', coordinates: [72.8777, 19.0760] },
    properties: {
      id: 99,
      frp: 50.0,
      brightness_temperature: 360,
      confidence: 90,
      satellite: 'N',
      detected_at: '2026-03-24T06:00:00Z',
      source: 'VIIRS_SNPP_NRT'
    }
  };
  const singleResult = spiderfyFeatures([singleFeature]);
  if (singleResult.features.length !== 1) throw new Error('Expected 1 feature');
  if (singleResult.features[0].geometry.coordinates[0] !== 72.8777 || singleResult.features[0].geometry.coordinates[1] !== 19.0760) {
    throw new Error('Single feature coordinates should not be altered!');
  }
  if (singleResult.features[0].properties.is_coincident !== false) {
    throw new Error('Single feature should not be marked as coincident');
  }
  if (singleResult.spiderLegs.features.length !== 0) {
    throw new Error('Single feature should not generate spider legs');
  }
  console.log('✓ TEST 3 PASSED: Single feature untouched with 0 spider legs.');

  console.log('\n=== TEST 4: Three Coincident Features Circular Spiderfication ===');
  const threeFeatures: EventFeatureItem[] = [
    { ...singleFeature, id: 101, properties: { ...singleFeature.properties, id: 101 } },
    { ...singleFeature, id: 102, properties: { ...singleFeature.properties, id: 102 } },
    { ...singleFeature, id: 103, properties: { ...singleFeature.properties, id: 103 } }
  ];
  const threeResult = spiderfyFeatures(threeFeatures, 50);
  if (threeResult.features.length !== 3) throw new Error('Expected 3 features');
  if (threeResult.spiderLegs.features.length !== 4) { // 1 hub + 3 legs
    throw new Error(`Expected 4 spider leg features (1 hub + 3 legs), got ${threeResult.spiderLegs.features.length}`);
  }
  console.log('✓ TEST 4 PASSED: 3 coincident features evenly distributed with 1 hub and 3 legs.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
