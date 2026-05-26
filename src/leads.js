import { Router } from "express";
import { db } from "./db.js";

export const leadsRouter = Router();

// GET /leads              → todos los leads (para vos como admin)
// GET /leads?token=XXX    → solo los leads de ese cliente
leadsRouter.get("/", async (req, res) => {
  const { token } = req.query;
  const leads = await db.getAllLeads(token || null);
  res.json({ total: leads.length, leads });
});
