import type { NextApiRequest, NextApiResponse } from 'next';
const apiApp = require('@ibm-agent/api/dist/index.js'); // Require the built API

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Pass the request to the Express app
  return apiApp(req, res);
}
