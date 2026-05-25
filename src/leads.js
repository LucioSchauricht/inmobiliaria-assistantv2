import { Router } from "express";
import { db } from "./db.js";

export const leadsRouter = Router();

// GET /leads              → todos los leads (para vos como admin)
// GET /leads?token=XXX    → solo los leads de ese cliente
leadsRouter.get("/", (req, res) => {
  const { token } = req.query;
  const leads = db.getAllLeads(token || null);
  res.json({ total: leads.length, leads });
});
