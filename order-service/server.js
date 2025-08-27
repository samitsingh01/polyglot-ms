const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'orderdb',
  user: 'postgres',
  password: 'password123'
});

// Service URLs
const USER_SERVICE_URL = 'http://100.27.190.117:3001';
const PRODUCT_SERVICE_URL = 'http://100.27.190.117:3002';

// Create orders table
async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Orders table created/verified');
  } catch (err) {
    console.error('Error creating table:', err);
  }
}

// Helper function to verify user exists
async function verifyUser(userId) {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/api/users/${userId}`);
    return response.data;
  } catch (error) {
    return null;
  }
}

// Helper function to verify product exists and get details
async function verifyProduct(productId) {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
    return response.data;
  } catch (error) {
    return null;
  }
}

// CRUD Routes

// GET all orders with user and product details
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id');
    const orders = result.rows;
    
    // Enrich orders with user and product data
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      const [user, product] = await Promise.all([
        verifyUser(order.user_id),
        verifyProduct(order.product_id)
      ]);
      
      return {
        ...order,
        user: user || { id: order.user_id, name: 'Unknown User' },
        product: product || { id: order.product_id, name: 'Unknown Product' }
      };
    }));
    
    res.json(enrichedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = result.rows[0];
    
    // Get user and product details
    const [user, product] = await Promise.all([
      verifyUser(order.user_id),
      verifyProduct(order.product_id)
    ]);
    
    const enrichedOrder = {
      ...order,
      user: user || { id: order.user_id, name: 'Unknown User' },
      product: product || { id: order.product_id, name: 'Unknown Product' }
    };
    
    res.json(enrichedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create order
app.post('/api/orders', async (req, res) => {
  try {
    const { user_id, product_id, quantity } = req.body;
    
    if (!user_id || !product_id || !quantity) {
      return res.status(400).json({ error: 'user_id, product_id, and quantity are required' });
    }

    // Verify user exists
    const user = await verifyUser(user_id);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Verify product exists and get price
    const product = await verifyProduct(product_id);
    if (!product) {
      return res.status(400).json({ error: 'Product not found' });
    }

    // Calculate total price
    const total_price = parseFloat(product.price) * quantity;

    const result = await pool.query(
      'INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, product_id, quantity, total_price]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update order status
app.put('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Order Service is running', port });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Order Service running on port ${port}`);
  createTable();
});
