#!/usr/bin/env python3
"""
Generate high-level architecture diagram for the Insurance Onboarding Platform
"""
import sys
from PIL import Image, ImageDraw, ImageFont

# Create image with white background
width, height = 1600, 1200
image = Image.new('RGB', (width, height), color='white')
draw = ImageDraw.Draw(image)

# Define colors
color_frontend = '#E3F2FD'  # Light blue
color_api = '#FFF3E0'       # Light orange
color_kafka = '#F3E5F5'     # Light purple
color_storage = '#E8F5E9'   # Light green
color_external = '#FCE4EC' # Light pink
color_border = '#333333'   # Dark gray
color_text = '#000000'     # Black

# Try to use a nicer font, fall back to default
try:
    title_font = ImageFont.truetype("arial.ttf", 28)
    header_font = ImageFont.truetype("arial.ttf", 18)
    normal_font = ImageFont.truetype("arial.ttf", 14)
    small_font = ImageFont.truetype("arial.ttf", 12)
except:
    title_font = ImageFont.load_default()
    header_font = ImageFont.load_default()
    normal_font = ImageFont.load_default()
    small_font = ImageFont.load_default()

def draw_box(x, y, width, height, text, color, font, border_width=2):
    """Draw a rounded rectangle box with text"""
    # Draw rectangle
    draw.rectangle([x, y, x + width, y + height], fill=color, outline=color_border, width=border_width)
    
    # Draw text
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    text_x = x + (width - text_width) // 2
    text_y = y + (height - text_height) // 2
    draw.text((text_x, text_y), text, fill=color_text, font=font)

def draw_arrow(x1, y1, x2, y2, color='#333333', width=3):
    """Draw arrow from (x1,y1) to (x2,y2)"""
    # Draw line
    draw.line([x1, y1, x2, y2], fill=color, width=width)
    
    # Draw arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_size = 15
    x_end = x2 - arrow_size * math.cos(angle)
    y_end = y2 - arrow_size * math.sin(angle)
    
    # Arrowhead triangle
    arrow_points = [
        (x2, y2),
        (x_end + arrow_size/2 * math.cos(angle + math.pi/6), 
         y_end + arrow_size/2 * math.sin(angle + math.pi/6)),
        (x_end + arrow_size/2 * math.cos(angle - math.pi/6), 
         y_end + arrow_size/2 * math.sin(angle - math.pi/6))
    ]
    draw.polygon(arrow_points, fill=color, outline=color)

# Title
draw.text((50, 20), "Insurance Onboarding Platform - High-Level Architecture", fill=color_text, font=title_font)

# Layer 1: Frontend (Top)
draw_box(50, 100, 250, 80, "Angular 16 Frontend", color_frontend, header_font)
draw_box(350, 100, 250, 80, "Login Component", color_frontend, header_font)
draw_box(650, 100, 250, 80, "Onboarding Wizard", color_frontend, header_font)
draw_box(950, 100, 250, 80, "Real-time Updates", color_frontend, header_font)

# Layer 2: Communication (Arrows down)
draw_arrow(175, 180, 175, 240)
draw_arrow(475, 180, 475, 240)
draw_arrow(775, 180, 775, 240)
draw_arrow(1075, 180, 1075, 240)

# Layer 3: API Gateway & WebSocket
draw_box(50, 240, 400, 80, "API Gateway (REST)", color_api, header_font)
draw_box(500, 240, 400, 80, "API Gateway (WebSocket)", color_api, header_font)

# Layer 4: Lambda Functions (Arrows down)
draw_arrow(250, 320, 150, 380)
draw_arrow(700, 320, 400, 380)
draw_arrow(700, 320, 600, 380)
draw_arrow(700, 320, 800, 380)

# Layer 5: Lambda Functions
draw_box(50, 380, 180, 70, "Submit User\nInfo", color_api, normal_font)
draw_box(280, 380, 180, 70, "Process\nDocuments", color_api, normal_font)
draw_box(510, 380, 180, 70, "Perform\nKYC", color_api, normal_font)
draw_box(740, 380, 180, 70, "Generate\nPolicy Recs", color_api, normal_font)

# Layer 6: Arrows to Kafka Producers
draw_arrow(140, 450, 140, 510)
draw_arrow(370, 450, 370, 510)
draw_arrow(600, 450, 600, 510)
draw_arrow(830, 450, 830, 510)

# Layer 7: Kafka Producer
draw_box(50, 510, 900, 70, "Kafka Producer (Non-Blocking) → Publishes Events to Topics", color_kafka, header_font)

# Layer 8: Arrow to MSK
draw_arrow(500, 580, 500, 640)

# Layer 9: AWS MSK Cluster
draw_box(150, 640, 700, 80, "AWS MSK (Kafka Cluster) - 3 Brokers", color_kafka, header_font)
draw.text((200, 700), "Topics: user-info-submitted | documents-processed | kyc-verified | policy-recommended | workflow-completed | errors", 
          fill=color_text, font=small_font)

# Layer 10: Arrows to Consumers
draw_arrow(250, 720, 250, 780)
draw_arrow(500, 720, 500, 780)
draw_arrow(750, 720, 750, 780)

# Layer 11: Kafka Consumers
draw_box(100, 780, 280, 70, "Consumer: Event\nLogger", color_kafka, normal_font)
draw_box(430, 780, 280, 70, "Consumer: WebSocket\nBroadcaster", color_kafka, normal_font)
draw_box(760, 780, 280, 70, "Consumer: SNS\nNotifier", color_kafka, normal_font)

# Layer 12: Arrows to downstream
draw_arrow(250, 850, 250, 910)
draw_arrow(570, 850, 350, 910)
draw_arrow(900, 850, 900, 910)

# Layer 13: Data & Notification Services
draw_box(100, 910, 280, 70, "DynamoDB\n(8 Tables)", color_storage, normal_font)
draw_box(430, 910, 280, 70, "WebSocket API\n(Real-time)", color_kafka, normal_font)
draw_box(760, 910, 280, 70, "SNS\n(Notifications)", color_external, normal_font)

# Layer 14: Arrow back to frontend
draw_arrow(570, 950, 1075, 150)

# Add legend
draw.text((50, 1050), "Legend:", fill=color_text, font=header_font)
draw_box(50, 1080, 100, 40, "", color_frontend, normal_font)
draw.text((160, 1090), "Frontend/UI", fill=color_text, font=normal_font)

draw_box(450, 1080, 100, 40, "", color_api, normal_font)
draw.text((560, 1090), "APIs/Lambda", fill=color_text, font=normal_font)

draw_box(850, 1080, 100, 40, "", color_kafka, normal_font)
draw.text((960, 1090), "Event Streaming", fill=color_text, font=normal_font)

draw_box(1250, 1080, 100, 40, "", color_storage, normal_font)
draw.text((1360, 1090), "Storage/Data", fill=color_text, font=normal_font)

# Save image
output_path = r'c:\Users\mypc\hack\agentic-ai-onboarding\ARCHITECTURE_DIAGRAM.png'
image.save(output_path)
print(f"Architecture diagram saved to: {output_path}")
