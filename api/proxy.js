// Vercel serverless function to proxy API requests
// This allows HTTPS frontend to communicate with HTTP backend

export default async function handler(req, res) {
  // Only allow POST requests for login
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the server URL from request body
  const { serverUrl, username, password } = req.body;

  if (!serverUrl || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Validate server URL
    let targetUrl;
    try {
      const url = new URL(serverUrl.trim());
      targetUrl = `${url.origin}/api/admin/login`;
    } catch (err) {
      return res.status(400).json({ error: 'Invalid server URL format' });
    }

    // Make request to the backend server
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    // Try to parse JSON response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text || 'Server error' };
      }
    }

    // Forward the response with the same status code
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    
    // Handle specific error types
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      res.status(503).json({ 
        error: 'Server unreachable',
        message: 'Cannot connect to the server. Please check if the server is running and the URL is correct.'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to connect to server',
        message: error.message 
      });
    }
  }
}
