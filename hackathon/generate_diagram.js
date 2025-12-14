const canvas = require('canvas');
const fs = require('fs');
const path = require('path');

// Create canvas
const width = 1600;
const height = 1200;
const canvasObj = canvas.createCanvas(width, height);
const ctx = canvasObj.getContext('2d');

// Fill background
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, width, height);

// Colors
const colors = {
  frontend: '#E3F2FD',
  api: '#FFF3E0',
  kafka: '#F3E5F5',
  storage: '#E8F5E9',
  external: '#FCE4EC',
  border: '#333333',
  text: '#000000'
};

// Draw box function
function drawBox(x, y, w, h, text, color, fontSize = 16) {
  ctx.fillStyle = color;
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  
  ctx.fillStyle = colors.text;
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Handle multiline text
  const lines = text.split('\n');
  const lineHeight = fontSize + 4;
  const totalHeight = lines.length * lineHeight;
  let startY = y + (h - totalHeight) / 2;
  
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, startY + (i * lineHeight));
  });
}

// Draw arrow function
function drawArrow(fromX, fromY, toX, toY, color = '#333333') {
  const headlen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  
  // Arrow head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// Title
ctx.fillStyle = colors.text;
ctx.font = 'bold 28px Arial';
ctx.textAlign = 'left';
ctx.fillText('Insurance Onboarding Platform - High-Level Architecture', 50, 50);

// Layer 1: Frontend
drawBox(50, 100, 250, 80, 'Angular 16\nFrontend', colors.frontend, 16);
drawBox(350, 100, 250, 80, 'Login\nComponent', colors.frontend, 16);
drawBox(650, 100, 250, 80, 'Onboarding\nWizard', colors.frontend, 16);
drawBox(950, 100, 250, 80, 'Real-time\nUpdates', colors.frontend, 16);

// Arrows down
drawArrow(175, 180, 175, 240);
drawArrow(475, 180, 475, 240);
drawArrow(775, 180, 775, 240);
drawArrow(1075, 180, 1075, 240);

// Layer 2: API Gateway
drawBox(50, 240, 400, 80, 'API Gateway (REST)', colors.api, 18);
drawBox(500, 240, 400, 80, 'API Gateway (WebSocket)', colors.api, 18);

// Arrows to Lambda
drawArrow(250, 320, 150, 380);
drawArrow(700, 320, 400, 380);
drawArrow(700, 320, 600, 380);
drawArrow(700, 320, 800, 380);

// Layer 3: Lambda Functions
drawBox(50, 380, 180, 70, 'Submit User\nInfo', colors.api, 14);
drawBox(280, 380, 180, 70, 'Process\nDocuments', colors.api, 14);
drawBox(510, 380, 180, 70, 'Perform\nKYC', colors.api, 14);
drawBox(740, 380, 180, 70, 'Generate\nPolicy Recs', colors.api, 14);

// Arrows to Kafka Producer
drawArrow(140, 450, 140, 510);
drawArrow(370, 450, 370, 510);
drawArrow(600, 450, 600, 510);
drawArrow(830, 450, 830, 510);

// Layer 4: Kafka Producer
drawBox(50, 510, 900, 70, 'Kafka Producer (Non-Blocking) → Publishes Events', colors.kafka, 16);

// Arrow to MSK
drawArrow(500, 580, 500, 640);

// Layer 5: AWS MSK
drawBox(150, 640, 700, 80, 'AWS MSK (Kafka Cluster) - 3 Brokers\nSCRAM-SHA-512 Auth | TLS Encryption', colors.kafka, 14);

// Topics text
ctx.fillStyle = colors.text;
ctx.font = '12px Arial';
ctx.textAlign = 'center';
ctx.fillText('6 Topics: user-info-submitted | documents-processed | kyc-verified | policy-recommended | workflow-completed | errors', 500, 740);

// Arrows to Consumers
drawArrow(250, 720, 250, 780);
drawArrow(500, 720, 500, 780);
drawArrow(750, 720, 750, 780);

// Layer 6: Consumers
drawBox(100, 780, 280, 70, 'Consumer:\nEvent Logger', colors.kafka, 14);
drawBox(430, 780, 280, 70, 'Consumer:\nWebSocket', colors.kafka, 14);
drawBox(760, 780, 280, 70, 'Consumer:\nSNS Notifier', colors.kafka, 14);

// Arrows to downstream
drawArrow(250, 850, 250, 910);
drawArrow(570, 850, 350, 910);
drawArrow(900, 850, 900, 910);

// Layer 7: Storage & Services
drawBox(100, 910, 280, 70, 'DynamoDB\n(8 Tables)', colors.storage, 16);
drawBox(430, 910, 280, 70, 'WebSocket API\n(Real-time Push)', colors.kafka, 14);
drawBox(760, 910, 280, 70, 'SNS\n(Notifications)', colors.external, 16);

// Arrow back to frontend
drawArrow(570, 950, 1075, 150);

// Legend
ctx.font = 'bold 16px Arial';
ctx.textAlign = 'left';
ctx.fillText('Legend:', 50, 1050);

drawBox(50, 1080, 80, 40, '', colors.frontend, 12);
ctx.fillStyle = colors.text;
ctx.font = '14px Arial';
ctx.fillText('Frontend/UI', 150, 1100);

drawBox(450, 1080, 80, 40, '', colors.api, 12);
ctx.fillText('APIs/Lambda', 550, 1100);

drawBox(850, 1080, 80, 40, '', colors.kafka, 12);
ctx.fillText('Event Streaming', 950, 1100);

drawBox(1250, 1080, 80, 40, '', colors.storage, 12);
ctx.fillText('Storage/Data', 1350, 1100);

// Save image
const buffer = canvasObj.toBuffer('image/png');
const outputPath = path.join(__dirname, 'ARCHITECTURE_DIAGRAM.png');
fs.writeFileSync(outputPath, buffer);
console.log(`Architecture diagram saved to: ${outputPath}`);
