/**
 * WebSocket Service - Real-time communication with frontend
 * Manages WebSocket connections and broadcasts Kafka events to connected clients
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const apiGatewayManagementApi = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT
});

/**
 * Lambda handler for WebSocket $connect route
 * Stores connection ID in DynamoDB for later use
 */
exports.connectHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;
    const customerId = event.queryStringParameters?.customerId;

    if (!customerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'customerId required' })
      };
    }

    // Store connection ID mapping
    await dynamodb.put({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Item: {
        customerId,
        connectionId,
        connectedAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hour TTL
      }
    }).promise();

    console.log(`✓ WebSocket connected: ${connectionId} for customerId: ${customerId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected' })
    };
  } catch (error) {
    console.error('WebSocket connect error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Connection failed' })
    };
  }
};

/**
 * Lambda handler for WebSocket $disconnect route
 * Removes connection ID from DynamoDB
 */
exports.disconnectHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;

    // Find and remove connection
    const result = await dynamodb.scan({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      FilterExpression: 'connectionId = :cid',
      ExpressionAttributeValues: { ':cid': connectionId }
    }).promise();

    if (result.Items && result.Items.length > 0) {
      await dynamodb.delete({
        TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
        Key: { customerId: result.Items[0].customerId }
      }).promise();
    }

    console.log(`✓ WebSocket disconnected: ${connectionId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' })
    };
  } catch (error) {
    console.error('WebSocket disconnect error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Disconnect failed' })
    };
  }
};

/**
 * Lambda handler for WebSocket default route
 * Echoes messages back to client or processes custom messages
 */
exports.defaultMessageHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;
    const body = JSON.parse(event.body || '{}');

    // Echo message back to client
    await apiGatewayManagementApi.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify({
        type: 'ECHO',
        message: body.message,
        timestamp: new Date().toISOString()
      })
    }).promise();

    console.log(`✓ Message echoed to ${connectionId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message processed' })
    };
  } catch (error) {
    console.error('WebSocket message handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Message processing failed' })
    };
  }
};

/**
 * Broadcast event to all connected clients (or specific customer)
 */
exports.broadcastEventHandler = async (event) => {
  try {
    const { customerId, messageType, data } = JSON.parse(event.body || '{}');

    const message = {
      type: messageType,
      data,
      timestamp: new Date().toISOString(),
      broadcastAt: new Date().toISOString()
    };

    if (customerId) {
      // Send to specific customer
      const connection = await dynamodb.get({
        TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
        Key: { customerId }
      }).promise();

      if (connection.Item) {
        await apiGatewayManagementApi.postToConnection({
          ConnectionId: connection.Item.connectionId,
          Data: JSON.stringify(message)
        }).promise();
        console.log(`✓ Event sent to customerId: ${customerId}`);
      }
    } else {
      // Broadcast to all connected clients
      const connections = await dynamodb.scan({
        TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections'
      }).promise();

      for (const connection of connections.Items || []) {
        try {
          await apiGatewayManagementApi.postToConnection({
            ConnectionId: connection.connectionId,
            Data: JSON.stringify(message)
          }).promise();
        } catch (error) {
          if (error.code === 'GoneException') {
            // Remove dead connection
            await dynamodb.delete({
              TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
              Key: { customerId: connection.customerId }
            }).promise();
          }
        }
      }
      console.log(`✓ Event broadcasted to ${connections.Items?.length || 0} clients`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event broadcasted' })
    };
  } catch (error) {
    console.error('Broadcast error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Broadcast failed' })
    };
  }
};

/**
 * Get connection status
 */
exports.statusHandler = async (event) => {
  try {
    const customerId = event.queryStringParameters?.customerId;

    if (!customerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'customerId required' })
      };
    }

    const connection = await dynamodb.get({
      TableName: process.env.WEBSOCKET_CONNECTIONS_TABLE || 'websocket-connections',
      Key: { customerId }
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        connected: !!connection.Item,
        connectionId: connection.Item?.connectionId,
        connectedAt: connection.Item?.connectedAt
      })
    };
  } catch (error) {
    console.error('Status check error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Status check failed' })
    };
  }
};
