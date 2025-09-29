#!/usr/bin/env node

/**
 * Script to populate metafields on Shopify orders
 * This will add sample metafield values to test the revenue calculation
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

if (!SHOP_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
  console.error('❌ Missing environment variables. Please check your .env file.');
  process.exit(1);
}

const shopify = axios.create({
  baseURL: `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    'Content-Type': 'application/json'
  }
});

async function getOrders(limit = 10) {
  try {
    const { data } = await shopify.get(`orders.json?limit=${limit}&status=any&fields=id,name,created_at`);
    return data.orders || [];
  } catch (error) {
    console.error('❌ Error fetching orders:', error.message);
    throw error;
  }
}

async function addMetafieldToOrder(orderId, namespace, key, value, type = 'money') {
  try {
    let metafieldValue = value;
    
    // For money type, format as JSON with amount and currency_code
    if (type === 'money') {
      metafieldValue = JSON.stringify({
        amount: parseFloat(value),
        currency_code: 'USD'
      });
    }
    
    const metafield = {
      metafield: {
        namespace: namespace,
        key: key,
        value: metafieldValue,
        type: type
      }
    };
    
    console.log(`🔍 Attempting to add metafield:`, metafield);
    
    const { data } = await shopify.post(`orders/${orderId}/metafields.json`, metafield);
    console.log(`✅ Added metafield ${namespace}.${key} = ${value} to order ${orderId}`);
    return data.metafield;
  } catch (error) {
    console.error(`❌ Error adding metafield to order ${orderId}:`, error.response?.data || error.message);
    throw error;
  }
}

async function populateMetafields() {
  try {
    console.log('🚀 Starting metafield population...');
    
    // Get recent orders
    const orders = await getOrders(5);
    console.log(`📦 Found ${orders.length} orders`);
    
    if (orders.length === 0) {
      console.log('❌ No orders found to populate metafields');
      return;
    }
    
    // Sample metafield values
    const sampleValues = [
      { additional_charges: 15.50, actual_total: 45.00 },
      { additional_charges: 25.00, actual_total: 75.00 },
      { additional_charges: 10.25, actual_total: 35.50 },
      { additional_charges: 30.75, actual_total: 95.25 },
      { additional_charges: 20.00, actual_total: 60.00 }
    ];
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const values = sampleValues[i % sampleValues.length];
      
      console.log(`\n📝 Processing order ${order.name} (ID: ${order.id})`);
      
      // Add additional charges metafield
      await addMetafieldToOrder(
        order.id,
        'distacart',
        'additional_charges',
        values.additional_charges.toString(),
        'money'
      );
      
      // Add actual total checkout price metafield
      await addMetafieldToOrder(
        order.id,
        'distacart',
        'actual_total_checkout_price',
        values.actual_total.toString(),
        'money'
      );
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n✅ Metafield population completed!');
    console.log('🔍 You can now test the revenue calculation with these populated metafields.');
    
  } catch (error) {
    console.error('❌ Error populating metafields:', error.message);
    process.exit(1);
  }
}

// Run the script
populateMetafields();
