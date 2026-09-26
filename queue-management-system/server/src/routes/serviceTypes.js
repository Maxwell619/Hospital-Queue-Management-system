const { Router } = require("express"); 
const prisma = require('../db'); 
const asyncHandler = require("../lib/asyncHandler"); 
const router = Router(); 
router.get( "/", asyncHandler(async (req, res) => { const serviceTypes = await prisma.serviceType.findMany({ orderBy: { serviceName: "asc" }, }); 
res.json(serviceTypes); }) ); module.exports = router;