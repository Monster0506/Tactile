const { Presentation, Session, DrawingStroke } = require('../models');
const StorageService = require('../services/StorageService');

/**
 * Example demonstrating the data models and storage functionality
 */
async function demonstrateDataModels() {
  console.log('=== Web Presentation Viewer - Data Models Demo ===\n');

  // Initialize storage service
  const storage = new StorageService();
  await storage.initialize();
  console.log('✓ Storage service initialized\n');

  // Create a new presentation
  const presentation = new Presentation({
    title: 'My Sample Presentation'
  });

  // Add some slides
  presentation.addSlide({
    imageUrl: '/uploads/slides/slide1.png',
    thumbnailUrl: '/uploads/slides/thumb1.png'
  });

  presentation.addSlide({
    imageUrl: '/uploads/slides/slide2.png',
    thumbnailUrl: '/uploads/slides/thumb2.png'
  });

  console.log(`✓ Created presentation: ${presentation.title}`);
  console.log(`  - ID: ${presentation.id}`);
  console.log(`  - URL: ${presentation.generateUrl()}`);
  console.log(`  - Total slides: ${presentation.getTotalSlides()}\n`);

  // Save presentation
  await storage.savePresentation(presentation);
  console.log('✓ Presentation saved to storage\n');

  // Create a session for the presentation
  const session = await storage.createSession(presentation.id);
  console.log(`✓ Created session: ${session.sessionId}`);
  console.log(`  - Current slide: ${session.getCurrentSlide()}`);
  console.log(`  - Connected clients: ${session.getClientCount()}\n`);

  // Simulate clients joining
  session.addClient('desktop-client-1', 'desktop');
  session.addClient('mobile-client-1', 'mobile');
  console.log('✓ Added clients to session');
  console.log(`  - Desktop clients: ${session.getClientsByDeviceType('desktop').length}`);
  console.log(`  - Mobile clients: ${session.getClientsByDeviceType('mobile').length}\n`);

  // Navigate slides
  session.updateCurrentSlide(1);
  console.log(`✓ Navigated to slide ${session.getCurrentSlide()}\n`);

  // Update laser pointer
  session.updateLaserPointer(150, 200, true);
  const laserPointer = session.getLaserPointer();
  console.log(`✓ Laser pointer activated at (${laserPointer.x}, ${laserPointer.y})\n`);

  // Add drawing to slide
  const slide = presentation.getSlideByIndex(1);
  const drawingStroke = new DrawingStroke({
    slideId: slide.id,
    color: '#FF0000',
    width: 3
  });

  drawingStroke.addPoint(100, 100);
  drawingStroke.addPoint(150, 120);
  drawingStroke.addPoint(200, 140);

  presentation.updateSlideDrawings(slide.id, [drawingStroke]);
  console.log(`✓ Added drawing stroke to slide ${slide.order + 1}`);
  console.log(`  - Stroke points: ${drawingStroke.getLength()}`);
  console.log(`  - Bounding box:`, drawingStroke.getBoundingBox());
  console.log('\n');

  // Update session and save
  await storage.updateSession(session);
  await storage.savePresentation(presentation);
  console.log('✓ Updated session and presentation in storage\n');

  // Get storage statistics
  const stats = await storage.getStorageStats();
  console.log('📊 Storage Statistics:');
  console.log(`  - Total presentations: ${stats.totalPresentations}`);
  console.log(`  - Total slides: ${stats.totalSlides}`);
  console.log(`  - Active sessions: ${stats.activeSessions}`);
  console.log(`  - Connected clients: ${stats.connectedClients}`);
  console.log(`  - Storage size: ${stats.totalSizeBytes} bytes\n`);

  // Validate all models
  const presentationValidation = presentation.validate();
  const sessionValidation = session.validate();
  const strokeValidation = drawingStroke.validate();

  console.log('✅ Validation Results:');
  console.log(`  - Presentation: ${presentationValidation.isValid ? 'Valid' : 'Invalid'}`);
  console.log(`  - Session: ${sessionValidation.isValid ? 'Valid' : 'Invalid'}`);
  console.log(`  - Drawing stroke: ${strokeValidation.isValid ? 'Valid' : 'Invalid'}\n`);

  // Demonstrate JSON serialization
  console.log('📄 JSON Serialization:');
  console.log('Presentation JSON:', JSON.stringify(presentation.toJSON(), null, 2));
  console.log('\nSession JSON:', JSON.stringify(session.toJSON(), null, 2));
  console.log('\nDrawing Stroke JSON:', JSON.stringify(drawingStroke.toJSON(), null, 2));

  console.log('\n=== Demo Complete ===');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateDataModels().catch(console.error);
}

module.exports = { demonstrateDataModels };