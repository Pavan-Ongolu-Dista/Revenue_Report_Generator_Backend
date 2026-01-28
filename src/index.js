import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.SERVER_PORT || 4000;
const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const SHOP_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

// Customer information mapping
const customerInfo = {
  '8688425369879': { name: 'Auxia Team', email: 'auxia@veeryoffices.com' },
  '8736318325015': { name: 'Baidu C200 Team', email: 'baiduc200@veeryoffices.com' },
  '8718672560407': { name: 'Baidu Team', email: 'baidu@veeryoffices.com' },
  '8721200316695': { name: 'Chai-Research Team', email: 'chai@veeryoffices.com' },
  '8940864995607': { name: 'Comulate Team', email: 'comulate@veeryoffices.com' },
  '8721199399191': { name: 'Hattrick Capital Team', email: 'hattrick@veeryoffices.com' },
  '8704188973335': { name: 'Marwood Team', email: 'marwood@veeryoffices.com' },
  '8688428843287': { name: 'Peloton Team', email: 'peloton@veeryoffices.com' },
  '8786145509655': { name: 'Starting Gate Team', email: 'startinggate@veeryoffices.com' },
  '8685830766871': { name: 'Sully AI Team', email: 'sully@veeryoffices.com' },
  '8721200939287': { name: 'Uphonest Team', email: 'uphonest@veeryoffices.com' },
  '8688802627863': { name: 'Veery Team', email: 'v@veeryoffices.com' },
  '8703720751383': { name: 'Workstream Team', email: 'workstream@veeryoffices.com' },
  '8726904209687': { name: 'Workstream MP Team', email: 'workstreammp@veeryoffices.com' },
  '8898937094423': { name: 'Workstream UTAH Team', email: 'workstreamutah@veeryoffices.com' },
  '9138324275479': { name: '@3120 Team'},
  '9161889743127': { name: 'Llamaindex Team', email: 'llamaindex@veeryoffices.com' },
  '9253797691671': { name: 'AYR Energy Team', email: 'ayrenergy@veeryoffices.com'},
  '9253770690839': { name: 'Lemon slice Team', email: 'lemonslice@veeryoffices.com'}
};

// Helper function to get customer name by ID
function getCustomerName(customerId) {
  const info = customerInfo[String(customerId)];
  return info ? info.name : `Customer #${customerId}`;
}

// Enhanced logging
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

// Validation
if (!SHOP_DOMAIN || !SHOP_TOKEN) {
  log('ERROR: Missing required environment variables', { SHOP_DOMAIN: !!SHOP_DOMAIN, SHOP_TOKEN: !!SHOP_TOKEN });
  process.exit(1);
}

log('Server starting with configuration', { 
  SHOP_DOMAIN, 
  API_VERSION, 
  PORT,
  TOKEN_PREFIX: SHOP_TOKEN?.substring(0, 10) + '...'
});

function shopify() {
  const instance = axios.create({
    baseURL: `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/`,
    headers: {
      'X-Shopify-Access-Token': SHOP_TOKEN,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  // Add request interceptor for logging
  instance.interceptors.request.use(
    (config) => {
      log('Shopify API Request', { 
        method: config.method?.toUpperCase(), 
        url: config.url,
        params: config.params 
      });
      return config;
    },
    (error) => {
      log('Request Error', error.message);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for error handling
  instance.interceptors.response.use(
    (response) => {
      log('Shopify API Response', { 
        status: response.status, 
        url: response.config.url,
        dataLength: Array.isArray(response.data) ? response.data.length : Object.keys(response.data || {}).length
      });
      return response;
    },
    (error) => {
      const errorInfo = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        data: error.response?.data
      };
      log('Shopify API Error', errorInfo);
      return Promise.reject(error);
    }
  );

  return instance;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Debug endpoint to list all metafields for orders
app.get('/api/debug/metafields', async (req, res) => {
  try {
    const { customerId, limit = 5 } = req.query;
    log('Debug: Fetching metafields', { customerId, limit });
    
    const params = new URLSearchParams({
      limit: String(limit),
      status: 'any',
      fields: 'id,name,created_at,customer,line_items,metafields'
    });
    if (customerId) params.set('customer_id', String(customerId));
    
    const { data } = await shopify().get(`orders.json?${params.toString()}`);
    const orders = data.orders || [];
    
    const metafieldData = orders.map(order => ({
      order_id: order.id,
      order_name: order.name,
      metafields: order.metafields || [],
      metafield_count: (order.metafields || []).length,
      line_items_sum: (order.line_items || []).reduce((sum, li) => {
        const price = Number(li.price) || 0;
        const qty = Number(li.quantity) || 0;
        return sum + (price * qty);
      }, 0)
    }));
    
    log('Debug: Metafield data', metafieldData);
    
    res.json({
      orders: metafieldData,
      total_orders: orders.length,
      summary: {
        orders_with_metafields: metafieldData.filter(o => o.metafield_count > 0).length,
        total_metafields: metafieldData.reduce((sum, o) => sum + o.metafield_count, 0)
      }
    });
  } catch (err) {
    log('Debug: Error fetching metafields', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to test metafield access directly
app.get('/api/debug/metafield-access', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }
    
    log('Debug: Testing metafield access for order', { orderId });
    
    // Test 1: Get order with metafields
    const { data: orderData } = await shopify().get(`orders/${orderId}.json?fields=id,name,metafields`);
    log('Debug: Order with metafields', orderData);
    
    // Test 2: Get metafields directly
    const { data: metafieldData } = await shopify().get(`orders/${orderId}/metafields.json`);
    log('Debug: Direct metafields', metafieldData);
    
    // Test 3: Search for specific metafields
    const { data: specificMetafields } = await shopify().get(`orders/${orderId}/metafields.json?namespace=distacart`);
    log('Debug: Distacart metafields', specificMetafields);
    
    res.json({
      order: orderData.order,
      metafields: metafieldData.metafields || [],
      distacart_metafields: specificMetafields.metafields || [],
      summary: {
        total_metafields: (metafieldData.metafields || []).length,
        distacart_metafields: (specificMetafields.metafields || []).length
      }
    });
  } catch (err) {
    log('Debug: Error testing metafield access', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to test GraphQL metafield access
app.get('/api/debug/graphql-metafields', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }
    
    log('Debug: Testing GraphQL metafield access for order', { orderId });
    
    const query = `
      query getOrderMetafields($id: ID!) {
        order(id: $id) {
          id
          name
          metafields(first: 10) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `;
    
    const { data } = await shopify().post('graphql.json', {
      query,
      variables: { id: `gid://shopify/Order/${orderId}` }
    });
    
    log('Debug: GraphQL metafield response', data);
    
    const metafields = data.data?.order?.metafields?.edges?.map(edge => edge.node) || [];
    
    res.json({
      order: data.data?.order,
      metafields,
      distacart_metafields: metafields.filter(m => m.namespace === 'distacart'),
      summary: {
        total_metafields: metafields.length,
        distacart_metafields: metafields.filter(m => m.namespace === 'distacart').length
      }
    });
  } catch (err) {
    log('Debug: Error testing GraphQL metafield access', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to test if we can access any metafields at all
app.get('/api/debug/test-metafield-permissions', async (req, res) => {
  try {
    log('Debug: Testing metafield permissions');
    
    // Test 1: Try to get metafields from any order
    const { data: ordersData } = await shopify().get('orders.json?limit=1&fields=id,name');
    const orderId = ordersData.orders?.[0]?.id;
    
    if (!orderId) {
      return res.json({ error: 'No orders found' });
    }
    
    // Test 2: Try to access metafields directly
    const { data: metafieldData } = await shopify().get(`orders/${orderId}/metafields.json`);
    log('Debug: Direct metafields access', metafieldData);
    
    // Test 3: Try GraphQL approach
    const query = `
      query getOrderMetafields($id: ID!) {
        order(id: $id) {
          id
          name
          metafields(first: 10) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `;
    
    const { data: graphqlData } = await shopify().post('graphql.json', {
      query,
      variables: { id: `gid://shopify/Order/${orderId}` }
    });
    
    log('Debug: GraphQL metafield access', graphqlData);
    
    // Test 4: Try to search for metafields by namespace
    const { data: namespaceData } = await shopify().get(`metafields.json?namespace=distacart`);
    log('Debug: Namespace metafields', namespaceData);
    
    res.json({
      test_order: { id: orderId, name: ordersData.orders?.[0]?.name },
      rest_metafields: metafieldData.metafields || [],
      graphql_metafields: graphqlData.data?.order?.metafields?.edges?.map(edge => edge.node) || [],
      namespace_metafields: namespaceData.metafields || [],
      summary: {
        rest_count: (metafieldData.metafields || []).length,
        graphql_count: (graphqlData.data?.order?.metafields?.edges || []).length,
        namespace_count: (namespaceData.metafields || []).length
      }
    });
  } catch (err) {
    log('Debug: Error testing metafield permissions', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check line items structure
app.get('/api/debug/line-items', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }
    
    log('Debug: Checking line items structure for order', { orderId });
    
    const { data: orderData } = await shopify().get(`orders/${orderId}.json?fields=id,name,line_items`);
    const order = orderData.order;
    
    res.json({
      order_id: order.id,
      order_name: order.name,
      line_items: order.line_items || [],
      line_items_count: (order.line_items || []).length,
      line_items_structure: (order.line_items || []).map(li => ({
        id: li.id,
        name: li.name,
        price: li.price,
        quantity: li.quantity,
        fulfillment_status: li.fulfillment_status,
        requires_shipping: li.requires_shipping,
        taxable: li.taxable,
        total_discount: li.total_discount
      }))
    });
  } catch (err) {
    log('Debug: Error checking line items', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check fulfillment statuses across multiple orders
app.get('/api/debug/fulfillment-statuses', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    log('Debug: Checking fulfillment statuses across orders');
    
    const { data: ordersData } = await shopify().get(`orders.json?limit=${limit}&status=any&fields=id,name,line_items`);
    const orders = ordersData.orders || [];
    
    const fulfillmentStatuses = {};
    const orderDetails = [];
    
    for (const order of orders) {
      const orderInfo = {
        order_id: order.id,
        order_name: order.name,
        line_items: []
      };
      
      for (const li of (order.line_items || [])) {
        const status = li.fulfillment_status || 'null';
        fulfillmentStatuses[status] = (fulfillmentStatuses[status] || 0) + 1;
        
        orderInfo.line_items.push({
          name: li.name,
          price: li.price,
          quantity: li.quantity,
          fulfillment_status: li.fulfillment_status,
          fulfillable_quantity: li.fulfillable_quantity,
          current_quantity: li.current_quantity
        });
      }
      
      orderDetails.push(orderInfo);
    }
    
    res.json({
      fulfillment_status_counts: fulfillmentStatuses,
      order_details: orderDetails,
      total_orders_checked: orders.length
    });
  } catch (err) {
    log('Debug: Error checking fulfillment statuses', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check metafield definitions and see what's actually stored
app.get('/api/debug/metafield-definitions', async (req, res) => {
  try {
    log('Debug: Checking metafield definitions');
    
    // Test 1: Get all metafield definitions
    const { data: definitionsData } = await shopify().get('metafields.json?limit=50');
    log('Debug: All metafield definitions', definitionsData);
    
    // Test 2: Get metafields by namespace
    const { data: distacartData } = await shopify().get('metafields.json?namespace=distacart&limit=50');
    log('Debug: Distacart metafields', distacartData);
    
    // Test 3: Get metafields by owner type (orders)
    const { data: orderMetafieldsData } = await shopify().get('metafields.json?owner_type=order&limit=50');
    log('Debug: Order metafields', orderMetafieldsData);
    
    // Test 4: Try to get a specific order with all its metafields
    const { data: ordersData } = await shopify().get('orders.json?limit=1&fields=id,name');
    const orderId = ordersData.orders?.[0]?.id;
    
    if (orderId) {
      const { data: orderMetafields } = await shopify().get(`orders/${orderId}/metafields.json?limit=50`);
      log('Debug: Specific order metafields', orderMetafields);
      
      // Test 5: Try GraphQL to get all metafields for this order
      const query = `
        query getOrderMetafields($id: ID!) {
          order(id: $id) {
            id
            name
            metafields(first: 50) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
                  owner {
                    ... on Order {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const { data: graphqlData } = await shopify().post('graphql.json', {
        query,
        variables: { id: `gid://shopify/Order/${orderId}` }
      });
      
      log('Debug: GraphQL order metafields', graphqlData);
      
      res.json({
        definitions: definitionsData.metafields || [],
        distacart_metafields: distacartData.metafields || [],
        order_metafields: orderMetafieldsData.metafields || [],
        specific_order: {
          id: orderId,
          name: ordersData.orders?.[0]?.name,
          metafields: orderMetafields.metafields || [],
          graphql_metafields: graphqlData.data?.order?.metafields?.edges?.map(edge => edge.node) || []
        },
        summary: {
          total_definitions: (definitionsData.metafields || []).length,
          distacart_count: (distacartData.metafields || []).length,
          order_metafields_count: (orderMetafieldsData.metafields || []).length,
          specific_order_count: (orderMetafields.metafields || []).length,
          graphql_count: (graphqlData.data?.order?.metafields?.edges || []).length
        }
      });
    } else {
      res.json({
        definitions: definitionsData.metafields || [],
        distacart_metafields: distacartData.metafields || [],
        order_metafields: orderMetafieldsData.metafields || [],
        summary: {
          total_definitions: (definitionsData.metafields || []).length,
          distacart_count: (distacartData.metafields || []).length,
          order_metafields_count: (orderMetafieldsData.metafields || []).length
        }
      });
    }
  } catch (err) {
    log('Debug: Error checking metafield definitions', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to test fulfillment query
app.get('/api/debug/fulfillments', async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId parameter is required' });
    }
    
    log('Debug: Testing fulfillment query for order', { orderId });
    
    const orderGid = `gid://shopify/Order/${orderId}`;
    const fulfillmentQuery = `
      query {
        order(id: "${orderGid}") {
          id
          name
          fulfillments(first: 10) {
            id
            status
            fulfillmentLineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  lineItem {
                    id
                    title
                    sku
                    quantity
                    variant {
                      id
                      title
                    }
                    product {
                      id
                      title
                    }
                  }
                  originalTotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const { data: fulfillmentData } = await shopify().post('graphql.json', {
      query: fulfillmentQuery
    });
    
    res.json({
      order_id: orderId,
      fulfillment_data: fulfillmentData,
      fulfillments_count: fulfillmentData?.data?.order?.fulfillments?.length || 0
    });
  } catch (err) {
    log('Debug: Error testing fulfillment query', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to test customer data access
app.get('/api/debug/customer-details', async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId parameter is required' });
    }
    
    log('Debug: Testing customer details access', { customerId });
    
    // Test 1: REST API with all fields
    const { data: restData } = await shopify().get(`customers/${customerId}.json`);
    
    // Test 2: GraphQL query for customer
    const customerGid = `gid://shopify/Customer/${customerId}`;
    const customerQuery = `
      query {
        customer(id: "${customerGid}") {
          id
          email
          firstName
          lastName
          displayName
          phone
          tags
          createdAt
          updatedAt
        }
      }
    `;
    
    const { data: graphqlData } = await shopify().post('graphql.json', {
      query: customerQuery
    });
    
    res.json({
      customer_id: customerId,
      rest_api_data: restData,
      graphql_data: graphqlData,
      rest_customer: restData?.customer,
      graphql_customer: graphqlData?.data?.customer
    });
  } catch (err) {
    log('Debug: Error testing customer details', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    log('Fetching customers', { since_id: req.query.since_id });
    const limit = 250;
    const since_id = req.query.since_id || undefined;
    const params = new URLSearchParams({ 
      limit: String(limit), 
      fields: 'id' 
    });
    if (since_id) params.set('since_id', String(since_id));
    
    const { data } = await shopify().get(`customers.json?${params.toString()}`);
    const customers = data.customers || [];
    
    log('Customers fetched successfully', { count: customers.length });
    res.json({ 
      customers,
      count: customers.length,
      hasMore: customers.length === limit
    });
  } catch (err) {
    log('Error fetching customers', err.message);
    const errorResponse = {
      error: err?.response?.data?.errors || err.message,
      status: err?.response?.status || 500,
      message: 'Failed to fetch customers'
    };
    res.status(errorResponse.status).json(errorResponse);
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { start, end, customerId } = req.query;
    
    // Validate required parameters
    if (!start || !end) {
      return res.status(400).json({ 
        error: 'Missing required parameters: start and end dates are required' 
      });
    }

    // Validate date format
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' 
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({ 
        error: 'Start date must be before end date' 
      });
    }

    log('Fetching fulfilled orders', { start, end, customerId });
    
    const limit = 250;
    const params = new URLSearchParams({
      limit: String(limit),
      status: 'any',
      fulfillment_status: 'shipped', // Filter for fulfilled orders only
      created_at_min: startDate.toISOString(),
      created_at_max: endDate.toISOString(),
      fields: 'id,name,created_at,customer,line_items,metafields,fulfillment_status'
    });
    if (customerId) params.set('customer_id', String(customerId));
    
    const orders = [];
    let since_id = null;
    let totalFetched = 0;
    
    while (true) {
      const requestParams = new URLSearchParams(params);
      if (since_id) {
        requestParams.set('since_id', since_id);
      }
      
      const { data } = await shopify().get(`orders.json?${requestParams.toString()}`);
      const chunk = data.orders || [];
      orders.push(...chunk);
      totalFetched += chunk.length;
      
      log(`Fetched batch`, { 
        chunkSize: chunk.length, 
        totalFetched,
        hasMore: chunk.length === limit 
      });
      
      if (chunk.length < limit) break;
      since_id = chunk[chunk.length - 1].id;
      
      // Safety limit to prevent infinite loops
      if (totalFetched > 10000) {
        log('WARNING: Reached maximum records limit (10000)', { totalFetched });
        break;
      }
    }
    
    log('Fulfilled orders fetched successfully', { 
      totalOrders: orders.length, 
      batches: Math.ceil(orders.length / limit),
      dateRange: { start, end }
    });
    
    res.json({ 
      orders,
      count: orders.length,
      dateRange: { start, end },
      customerId: customerId || null
    });
  } catch (err) {
    log('Error fetching orders', err.message);
    const errorResponse = {
      error: err?.response?.data?.errors || err.message,
      status: err?.response?.status || 500,
      message: 'Failed to fetch orders'
    };
    res.status(errorResponse.status).json(errorResponse);
  }
});

// Enhanced metafield parsing functions
function parseAdditionalCharges(metafields) {
  for (const m of (metafields || [])) {
    const ns = m.namespace || '';
    const key = m.key || '';
    if ((ns === 'distacart' && key === 'additional_charges') || key === 'distacart.additional_charges') {
      const v = m.value;
      
      // Handle JSON money format
      if (typeof v === 'string' && v.startsWith('{')) {
        try {
          const parsed = JSON.parse(v);
          if (parsed.amount) return Number(parsed.amount);
        } catch (e) {
          // Fall through to number parsing
        }
      }
      
      // Handle direct number
      const num = Number(v);
      if (!Number.isNaN(num)) return num;
      
      // Try to extract numbers from string
      const matches = String(v).match(/[-+]?[0-9]*\.?[0-9]+/g);
      if (matches) return matches.map(Number).reduce((a, b) => a + b, 0);
    }
  }
  return 0;
}

function parseActualTotal(metafields) {
  for (const m of (metafields || [])) {
    const ns = m.namespace || '';
    const key = m.key || '';
    if ((ns === 'distacart' && key === 'actual_total_checkout_price') || key === 'distacart.actual_total_checkout_price') {
      const v = m.value;
      
      // Handle JSON money format
      if (typeof v === 'string' && v.startsWith('{')) {
        try {
          const parsed = JSON.parse(v);
          if (parsed.amount) return Number(parsed.amount);
        } catch (e) {
          // Fall through to number parsing
        }
      }
      
      // Handle direct number
      const num = Number(v);
      return Number.isNaN(num) ? 0 : num;
    }
  }
  return 0;
}

app.post('/api/report', async (req, res) => {
  try {
    const { start, end, metric, customerId } = req.body;
    
    // Validate request body
    if (!start || !end || !metric) {
      return res.status(400).json({ 
        error: 'Missing required fields: start, end, and metric are required' 
      });
    }

    if (!['billing', 'actual'].includes(metric)) {
      return res.status(400).json({ 
        error: 'Invalid metric. Must be "billing" or "actual"' 
      });
    }

    log('Generating report for fulfilled orders', { start, end, metric, customerId });
    
    const limit = 250;
    const params = new URLSearchParams({
      limit: String(limit),
      status: 'any',
      fulfillment_status: 'shipped', // Filter for fulfilled orders only
      created_at_min: new Date(start).toISOString(),
      created_at_max: new Date(end).toISOString(),
      fields: 'id,name,created_at,customer,line_items,metafields,fulfillment_status'
    });
    if (customerId) params.set('customer_id', String(customerId));
    
    const orders = [];
    let since_id = null;
    let totalFetched = 0;
    
    while (true) {
      const requestParams = new URLSearchParams(params);
      if (since_id) {
        requestParams.set('since_id', since_id);
      }
      
      const { data } = await shopify().get(`orders.json?${requestParams.toString()}`);
      const chunk = data.orders || [];
      orders.push(...chunk);
      totalFetched += chunk.length;
      
      if (chunk.length < limit) break;
      since_id = chunk[chunk.length - 1].id;
      
      // Safety limit to prevent infinite loops
      if (totalFetched > 10000) {
        log('WARNING: Reached maximum records limit (10000)', { totalFetched });
        break;
      }
    }
    // Build enhanced dataframe-like results with GraphQL metafield fetching
    const rows = [];
    for (const o of orders) {
      try {
        // Fetch metafields using GraphQL for better performance
        const query = `
          query getOrderMetafields($id: ID!) {
            order(id: $id) {
              id
              name
              metafields(first: 10) {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        `;
        
        const { data: graphqlData } = await shopify().post('graphql.json', {
          query,
          variables: { id: `gid://shopify/Order/${o.id}` }
        });
        
        const orderMetafields = graphqlData.data?.order?.metafields?.edges?.map(edge => edge.node) || [];
        
        const order_number = o.name ? String(o.name).replace('#','').trim() : undefined;
        const customer_email = o.customer?.email || null;
        const customer_id = o.customer?.id || null;
        const created_at = o.created_at;
        
        // Calculate line items sum - only include fulfilled items from fulfillments
        let line_sum = 0;
        let included_items = 0;
        
        // Fetch fulfillments for this order to get only fulfilled line items
        try {
          const orderId = `gid://shopify/Order/${o.id}`;
          const fulfillmentQuery = `
            query {
              order(id: "${orderId}") {
                id
                name
                fulfillments(first: 10) {
                  id
                  status
                  fulfillmentLineItems(first: 50) {
                    edges {
                      node {
                        id
                        quantity
                        lineItem {
                          id
                          title
                          sku
                          quantity
                          variant {
                            id
                            title
                          }
                          product {
                            id
                            title
                          }
                        }
                        originalTotalSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;
          
          const { data: fulfillmentData } = await shopify().post('graphql.json', {
            query: fulfillmentQuery
          });
          
          const orderData = fulfillmentData.data?.order;
          if (orderData && orderData.fulfillments) {
            for (const fulfillment of orderData.fulfillments) {
              if (fulfillment.status === 'SUCCESS' && fulfillment.fulfillmentLineItems?.edges) {
                for (const edge of fulfillment.fulfillmentLineItems.edges) {
                  const node = edge.node;
                  const quantity = Number(node.quantity) || 0;
                  const originalTotal = node.originalTotalSet?.shopMoney?.amount || 0;
                  const price = Number(originalTotal) / quantity || 0;
                  
                  if (quantity > 0 && price > 0) {
                    line_sum += price * quantity;
                    included_items++;
                    log(`Order ${o.id}: Including fulfilled item ${node.lineItem?.title} (${quantity} qty) - $${price} x ${quantity}`);
                  }
                }
              }
            }
          }
        } catch (fulfillmentErr) {
          log(`Order ${o.id}: Error fetching fulfillments, falling back to line items`, fulfillmentErr.message);
          
          // Fallback to original line items logic if fulfillment query fails
          for (const li of (o.line_items || [])) {
            // Skip removed, cancelled, or refunded items
            if (li.fulfillment_status === 'removed' || 
                li.fulfillment_status === 'cancelled' || 
                li.fulfillment_status === 'refunded' ||
                li.fulfillment_status === 'returned') {
              continue;
            }
            
            // Use fulfillable_quantity to determine if item should be included
            const fulfillable_qty = Number(li.fulfillable_quantity) || 0;
            const total_qty = Number(li.quantity) || 0;
            
            if (fulfillable_qty < total_qty) {
              // Some or all quantity has been fulfilled
              const fulfilled_qty = total_qty - fulfillable_qty;
              const price = Number(li.price) || 0;
              line_sum += price * fulfilled_qty;
              included_items++;
              log(`Order ${o.id}: Including ${li.name} (${fulfilled_qty}/${total_qty} fulfilled) - $${li.price} x ${fulfilled_qty}`);
            }
          }
        }
        
        log(`Order ${o.id}: Included ${included_items} fulfilled items, total line sum: $${line_sum.toFixed(2)}`);
        
        // Parse metafields using enhanced functions
        const additional = parseAdditionalCharges(orderMetafields);
        const actual = parseActualTotal(orderMetafields);
        const billing = line_sum + additional;
        
        // Debug logging for metafields
        if (orderMetafields && orderMetafields.length > 0) {
          log(`Order ${o.id} metafields:`, orderMetafields.map(m => ({ 
            namespace: m.namespace, 
            key: m.key, 
            value: m.value 
          })));
          log(`Order ${o.id} calculations:`, { 
            line_sum, 
            additional, 
            actual, 
            billing 
          });
        }
        
        rows.push({
          order_id: o.id,
          order_number,
          order_date: created_at,
          customer_id,
          customer_name: getCustomerName(customer_id),
          customer_email,
          line_sum,
          additional_charges: additional,
          billing_amount: billing,
          actual_spend: actual,
          profit_margin: billing > 0 ? ((billing - actual) / billing * 100) : 0
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        log(`Error fetching metafields for order ${o.id}:`, error.message);
        // Continue with order without metafields
        const order_number = o.name ? String(o.name).replace('#','').trim() : undefined;
        const customer_email = o.customer?.email || null;
        const customer_id = o.customer?.id || null;
        const created_at = o.created_at;
        
        let line_sum = 0;
        // Use fallback logic for error handling (same as main logic)
        for (const li of (o.line_items || [])) {
          // Skip removed, cancelled, or refunded items
          if (li.fulfillment_status === 'removed' || 
              li.fulfillment_status === 'cancelled' || 
              li.fulfillment_status === 'refunded' ||
              li.fulfillment_status === 'returned') {
            continue;
          }
          
          // Use fulfillable_quantity to determine if item should be included
          const fulfillable_qty = Number(li.fulfillable_quantity) || 0;
          const total_qty = Number(li.quantity) || 0;
          
          if (fulfillable_qty < total_qty) {
            // Some or all quantity has been fulfilled
            const fulfilled_qty = total_qty - fulfillable_qty;
            const price = Number(li.price) || 0;
            line_sum += price * fulfilled_qty;
          }
        }
        
        rows.push({
          order_id: o.id,
          order_number,
          order_date: created_at,
          customer_id,
          customer_name: getCustomerName(customer_id),
          customer_email,
          line_sum,
          additional_charges: 0,
          billing_amount: line_sum,
          actual_spend: 0,
          profit_margin: 0
        });
      }
    }

    // Enhanced grouping and analytics
    const monthKey = (iso) => new Date(iso).toISOString().slice(0,7);
    const metricField = metric === 'actual' ? 'actual_spend' : 'billing_amount';
    const groups = new Map();
    
    for (const r of rows) {
      const month = monthKey(r.order_date);
      const customerKey = r.customer_email || String(r.customer_id || 'unknown');
      const key = customerKey + '|' + month;
      
      if (!groups.has(key)) {
        groups.set(key, { 
          customer: customerKey, 
          month, 
          orders: 0, 
          amount: 0, 
          order_numbers: new Set(),
          total_billing: 0,
          total_actual: 0,
          avg_profit_margin: 0
        });
      }
      
      const g = groups.get(key);
      g.orders += 1;
      g.amount += Number(r[metricField] || 0);
      g.total_billing += Number(r.billing_amount || 0);
      g.total_actual += Number(r.actual_spend || 0);
      
      if (r.order_number) g.order_numbers.add(String(r.order_number));
    }
    
    // Calculate analytics
    const summary = Array.from(groups.values()).map(g => {
      const profit_margin = g.total_billing > 0 ? ((g.total_billing - g.total_actual) / g.total_billing * 100) : 0;
      return {
        customer: g.customer,
        month: g.month,
        orders: g.orders,
        amount: g.amount,
        order_numbers: Array.from(g.order_numbers).sort().join(', '),
        total_billing: g.total_billing,
        total_actual: g.total_actual,
        profit_margin: Math.round(profit_margin * 100) / 100
      };
    }).sort((a,b)=> a.month.localeCompare(b.month) || String(a.customer).localeCompare(String(b.customer)));

    // Calculate overall analytics
    const totalRevenue = summary.reduce((sum, g) => sum + g.amount, 0);
    const totalOrders = summary.reduce((sum, g) => sum + g.orders, 0);
    const uniqueCustomers = new Set(summary.map(g => g.customer)).size;
    const avgProfitMargin = summary.length > 0 ? 
      summary.reduce((sum, g) => sum + g.profit_margin, 0) / summary.length : 0;

    const analytics = {
      totalRevenue,
      totalOrders,
      uniqueCustomers,
      avgProfitMargin: Math.round(avgProfitMargin * 100) / 100,
      dateRange: { start, end },
      metric,
      customerId: customerId || null
    };

    log('Report generated successfully', analytics);

    res.json({ 
      summary, 
      detail: rows,
      analytics,
      metadata: {
        generatedAt: new Date().toISOString(),
        totalRecords: rows.length,
        summaryRecords: summary.length
      }
    });
  } catch (err) {
    log('Error generating report', err.message);
    const errorResponse = {
      error: err?.response?.data?.errors || err.message,
      status: err?.response?.status || 500,
      message: 'Failed to generate report'
    };
    res.status(errorResponse.status).json(errorResponse);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});


