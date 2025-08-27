const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// AWS Bedrock client configuration
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ai-service',
    timestamp: new Date().toISOString(),
  });
});

// Text generation endpoint using Claude
app.post('/api/generate-text', async (req, res) => {
  try {
    const { prompt, maxTokens = 1000, temperature = 0.7 } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Prompt is required',
      });
    }

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    res.json({
      success: true,
      response: responseBody.content[0].text,
      model: modelId,
      usage: responseBody.usage,
    });

  } catch (error) {
    console.error('Error generating text:', error);
    res.status(500).json({
      error: 'Failed to generate text',
      message: error.message,
    });
  }
});

// Product description generation endpoint
app.post('/api/generate-product-description', async (req, res) => {
  try {
    const { productName, features, category, targetAudience } = req.body;

    if (!productName) {
      return res.status(400).json({
        error: 'Product name is required',
      });
    }

    const prompt = `Generate a compelling product description for the following product:

Product Name: ${productName}
Category: ${category || 'General'}
Target Audience: ${targetAudience || 'General consumers'}
Key Features: ${features || 'Not specified'}

Please create a marketing description that is:
- Engaging and persuasive
- Highlights key benefits
- Uses appropriate tone for the target audience
- Between 100-200 words
- Includes a call-to-action

Format the response as a clean, ready-to-use product description.`;

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    res.json({
      success: true,
      productName,
      description: responseBody.content[0].text,
      model: modelId,
    });

  } catch (error) {
    console.error('Error generating product description:', error);
    res.status(500).json({
      error: 'Failed to generate product description',
      message: error.message,
    });
  }
});

// Customer support chat endpoint
app.post('/api/customer-support', async (req, res) => {
  try {
    const { message, context = '', userId } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required',
      });
    }

    const prompt = `You are a helpful customer support assistant for an e-commerce platform. 
Context: ${context}
Customer Message: ${message}

Please provide a helpful, professional, and friendly response. If the question is about:
- Orders: Help with order status, tracking, returns
- Products: Provide information about features, compatibility, usage
- Account: Assist with account-related issues
- General: Provide general assistance

Keep responses concise but thorough.`;

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    res.json({
      success: true,
      response: responseBody.content[0].text,
      userId: userId || 'anonymous',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in customer support:', error);
    res.status(500).json({
      error: 'Failed to process customer support request',
      message: error.message,
    });
  }
});

// Content moderation endpoint
app.post('/api/moderate-content', async (req, res) => {
  try {
    const { content, type = 'general' } = req.body;

    if (!content) {
      return res.status(400).json({
        error: 'Content is required',
      });
    }

    const prompt = `Please analyze the following content for moderation purposes:

Content: "${content}"
Content Type: ${type}

Evaluate the content for:
1. Inappropriate language or profanity
2. Spam or promotional content
3. Harmful or offensive material
4. Compliance with community guidelines

Respond with a JSON object containing:
- "safe": boolean (true if content is safe)
- "confidence": number (0-1, confidence in the assessment)
- "reasons": array of any issues found
- "recommendation": string (approve/reject/review)

Be conservative in your assessment to ensure user safety.`;

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    let moderationResult;
    try {
      moderationResult = JSON.parse(responseBody.content[0].text);
    } catch (parseError) {
      // Fallback if AI doesn't return valid JSON
      moderationResult = {
        safe: true,
        confidence: 0.5,
        reasons: [],
        recommendation: 'review',
        note: 'Could not parse AI response, manual review recommended'
      };
    }

    res.json({
      success: true,
      content: content,
      moderation: moderationResult,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error moderating content:', error);
    res.status(500).json({
      error: 'Failed to moderate content',
      message: error.message,
    });
  }
});

// List available AI models
app.get('/api/models', (req, res) => {
  const availableModels = [
    {
      id: 'anthropic.claude-3-sonnet-20240229-v1:0',
      name: 'Claude 3 Sonnet',
      description: 'Balanced model for various text generation tasks',
      capabilities: ['text-generation', 'analysis', 'conversation']
    },
    {
      id: 'anthropic.claude-3-haiku-20240307-v1:0',
      name: 'Claude 3 Haiku',
      description: 'Fast and efficient model for quick responses',
      capabilities: ['text-generation', 'conversation']
    }
  ];

  res.json({
    success: true,
    models: availableModels,
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`AI Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
