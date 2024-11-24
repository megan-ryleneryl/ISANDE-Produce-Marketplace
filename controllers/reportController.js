const User = require('../models/User');
const Request = require('../models/Request');
const Order = require('../models/Order');
const Item = require('../models/Item');
const Delivery = require('../models/Delivery');

const reportController = {
    async getCustomerReport(req, res) {
        try {
            const customerId = parseInt(req.session.userId);
            const month = req.params.month || new Date().toLocaleString('en-US', { month: 'short' });
            const year = new Date().getFullYear();
            
            // Get customer details
            const customer = await User.findOne({ userID: customerId });
            
            // First get all requests for this customer
            const requests = await Request.find({ customerID: customerId });
            
            // Get the start and end date for the selected month
            const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
            const startDate = new Date(year, monthIndex, 1);
            const endDate = new Date(year, monthIndex + 1, 0);
    
            // Then get all orders linked to these requests and filter by delivery date for the selected month
            const orders = await Order.find({
                requestID: { $in: requests.map(req => req.requestID) },
                deliveryDate: {
                    $gte: startDate.toISOString(),
                    $lte: endDate.toISOString()
                }
            }).sort({ deliveryDate: 1 });
    
            // Calculate summary statistics
            const summary = {
                totalDeliveries: orders.length,
                cancelledDeliveries: orders.filter(o => o.status === 'Cancelled').length,
                averageOrderCost: 0,
                averageWeeklyDeliveries: Math.ceil(orders.length / 4),
            };
            
            // Calculate average order cost
            if (orders.length > 0) {
                const orderTotals = await Promise.all(orders.map(order => calculateOrderTotal(order)));
                const totalCost = orderTotals.reduce((sum, total) => sum + total, 0);
                summary.averageOrderCost = totalCost / orders.length;
            }
    
            // Get commonly bought items for this month
            const itemCounts = {};
            for (const order of orders) {
                for (const item of order.items) {
                    itemCounts[item.itemID] = (itemCounts[item.itemID] || 0) + item.quantity;
                }
            }
    
            // Get item details and sort by quantity
            const commonItems = await Promise.all(
                Object.entries(itemCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(async ([itemId]) => {
                        const item = await Item.findOne({ itemID: parseInt(itemId) });
                        return item ? item.itemName : 'Unknown Item';
                    })
            );
    
            // Calculate order summary
            const orderSummary = await Promise.all(orders.map(async order => {
                const items = await Promise.all(order.items.map(async item => {
                    const itemDetails = await Item.findOne({ itemID: item.itemID });
                    return {
                        name: itemDetails ? itemDetails.itemName : 'Unknown Item',
                        quantity: item.quantity,
                        cost: item.quantity * (itemDetails ? itemDetails.itemPrice : 0)
                    };
                }));
    
                // Find the corresponding request to get info if needed
                const request = requests.find(req => req.requestID === order.requestID);
    
                return {
                    orderId: order.OrderID,
                    requestDate: request ? request.requestDate : null,
                    deliveryDate: order.deliveryDate,
                    schedule: order.deliveryTimeRange,
                    items: items.map(i => i.name).join(', '),
                    payment: order.paymentMethod,
                    total: items.reduce((sum, item) => sum + item.cost, 0)
                };
            }));
    
            // Calculate produce summary
            const produceSummary = [];
            for (const [itemId, quantity] of Object.entries(itemCounts)) {
                const itemDetails = await Item.findOne({ itemID: parseInt(itemId) });
                if (itemDetails) {
                    produceSummary.push({
                        name: itemDetails.itemName,
                        quantity,
                        cost: quantity * itemDetails.itemPrice
                    });
                }
            }
    
            res.render('reports/customer-report', {
                title: 'Monthly Order Report',
                css: ['report.css'],
                layout: 'report',
                month,
                year,
                customer,
                summary,
                commonItems: commonItems.join(', '),
                commonSchedule: getCommonSchedule(orders),
                orderSummary,
                produceSummary,
                totalAmount: produceSummary.reduce((sum, item) => sum + item.cost, 0),
                generatedDate: new Date().toLocaleDateString(),
                downloadUrl: `/reports/customer/${month}/download/tool`,
                
            });
    
        } catch (error) {
            console.error('Error generating report:', error);
            res.status(500).send('Error generating report');
        }
    },

    async downloadCustomerReportUsingTool(req, res) {
        try {
            const customerId = parseInt(req.session.userId);
            const month = req.params.month || new Date().toLocaleString('en-US', { month: 'short' });
            const year = new Date().getFullYear();
    
            // Get customer details
            const customer = await User.findOne({ userID: customerId });
            
            // Get all requests for this customer
            const requests = await Request.find({ customerID: customerId });
            
            // Get the start and end date for the selected month
            const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
            const startDate = new Date(year, monthIndex, 1);
            const endDate = new Date(year, monthIndex + 1, 0);
    
            // Get all orders for the month
            const orders = await Order.find({
                requestID: { $in: requests.map(req => req.requestID) },
                deliveryDate: {
                    $gte: startDate.toISOString(),
                    $lte: endDate.toISOString()
                }
            }).sort({ deliveryDate: 1 });
    
            // Calculate summary statistics
            const summary = {
                totalDeliveries: orders.length,
                cancelledDeliveries: orders.filter(o => o.status === 'Cancelled').length,
                averageOrderCost: 0,
                averageWeeklyDeliveries: Math.ceil(orders.length / 4),
            };
            
            // Calculate average order cost
            if (orders.length > 0) {
                const orderTotals = await Promise.all(orders.map(order => calculateOrderTotal(order)));
                const totalCost = orderTotals.reduce((sum, total) => sum + total, 0);
                summary.averageOrderCost = totalCost / orders.length;
            }
    
            // Get commonly bought items
            const itemCounts = {};
            for (const order of orders) {
                for (const item of order.items) {
                    itemCounts[item.itemID] = (itemCounts[item.itemID] || 0) + item.quantity;
                }
            }
    
            // Get item details and sort by quantity
            const commonItems = await Promise.all(
                Object.entries(itemCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5)
                    .map(async ([itemId]) => {
                        const item = await Item.findOne({ itemID: parseInt(itemId) });
                        return item ? item.itemName : 'Unknown Item';
                    })
            );
    
            // Calculate order summary
            const orderSummary = await Promise.all(orders.map(async order => {
                const items = await Promise.all(order.items.map(async item => {
                    const itemDetails = await Item.findOne({ itemID: item.itemID });
                    return {
                        name: itemDetails ? itemDetails.itemName : 'Unknown Item',
                        quantity: item.quantity,
                        cost: item.quantity * (itemDetails ? itemDetails.itemPrice : 0)
                    };
                }));
    
                const request = requests.find(req => req.requestID === order.requestID);
    
                return {
                    orderId: order.OrderID,
                    requestDate: request ? request.requestDate : null,
                    deliveryDate: order.deliveryDate,
                    schedule: order.deliveryTimeRange,
                    items: items.map(i => i.name).join(', '),
                    payment: order.paymentMethod,
                    total: items.reduce((sum, item) => sum + item.cost, 0)
                };
            }));
    
            // Calculate produce summary
            const produceSummary = [];
            for (const [itemId, quantity] of Object.entries(itemCounts)) {
                const itemDetails = await Item.findOne({ itemID: parseInt(itemId) });
                if (itemDetails) {
                    produceSummary.push({
                        name: itemDetails.itemName,
                        quantity,
                        cost: quantity * itemDetails.itemPrice
                    });
                }
            }
    
            const totalAmount = produceSummary.reduce((sum, item) => sum + item.cost, 0);
            const commonSchedule = getCommonSchedule(orders);
    
            // Render the report page first
            res.render('reports/customer-report', {
                title: 'Monthly Order Report',
                css: ['report.css'],
                layout: 'report',
                month,
                year,
                customer,
                summary,
                commonItems: commonItems.join(', '),
                commonSchedule,
                orderSummary,
                produceSummary,
                totalAmount,
                generatedDate: new Date().toLocaleDateString(),
                isDownload: true, // Add this flag to indicate download mode
                
            });
    
        } catch (error) {
            console.error('Error downloading report:', error);
            res.status(500).send('Error downloading report');
        }
    },
    async getLogisticsReport(req, res) {
        try {
            const month = req.params.month || new Date().toLocaleString('en-US', { month: 'short' });
            const year = new Date().getFullYear();

            // Get the start and end date for the selected month
            const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
            const startDate = new Date(year, monthIndex, 1);
            const endDate = new Date(year, monthIndex + 1, 0);

            // Get all orders for the month
            const orders = await Order.find({
                deliveryDate: {
                    $gte: startDate.toISOString(),
                    $lte: endDate.toISOString()
                }
            }).sort({ deliveryDate: 1 });

            // Group orders by week
            const weeks = {};
            for (const order of orders) {
                const orderDate = new Date(order.deliveryDate);
                const weekNum = Math.ceil((orderDate.getDate() - orderDate.getDay() + 1) / 7);
                console.log(`Order ID: ${order.OrderID} - Order Date: ${orderDate.toISOString()} - Week Number: ${weekNum}`);

                if (!weeks[weekNum]) {
                    weeks[weekNum] = {
                        noOfOrders: 0,
                        fulfilledOnTime: 0,
                        fulfilledLate: 0,
                        cancelled: 0,
                        alertsIssued: 0,
                        fulfillmentRate: 0
                    };
                }
                weeks[weekNum].noOfOrders++;

                // Look at the Deliveries Table if a delivery is made for this order
                if (order.status === 'Delivered') {
                    try {
                        // Get all deliveries linked to an order, sort by date with the latest first
                        const deliveries = await Delivery.find({ orderID: order.OrderID }).sort({ deliveryDate: -1 });

                        // Get only the isComplete = true deliveries
                        const completedDeliveries = deliveries.filter(delivery => delivery.isComplete === true);

                        // Get the latest delivery
                        const latestDelivery = completedDeliveries[0] || null;

                        if (latestDelivery) {
                            const scheduledDate = new Date(order.deliveryDate);
                            const actualDeliveryDate = new Date(latestDelivery.deliveryDate);
                            if (actualDeliveryDate <= scheduledDate) {
                                weeks[weekNum].fulfilledOnTime++;
                            } else {
                                weeks[weekNum].fulfilledLate++;
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching delivery for order ${order._id}:`, error);
                    }
                } else if (order.status === 'Cancelled') {
                    weeks[weekNum].cancelled++;
                }
            }

            // Calculate fulfillment rates and format weeks data
            const weeklyData = Object.entries(weeks).map(([weekNum, data]) => {
                const total = data.fulfilledOnTime + data.fulfilledLate + data.cancelled;
                const fulfillmentRate = total > 0
                    ? (((data.fulfilledOnTime + data.fulfilledLate)/ total) * 100).toFixed(2)
                    : 0;

                return {
                    week: `WEEK ${weekNum}`,
                    ...data,
                    fulfillmentRate: `${fulfillmentRate}%`
                };
            });

            // Calculate monthly totals
            const monthlyTotals = {
                noOfOrders: 0,
                fulfilledOnTime: 0,
                fulfilledLate: 0,
                cancelled: 0,
                alertsIssued: 0,
                fulfillmentRate: '0.00%'
            };

            for (const week of weeklyData) {
                monthlyTotals.noOfOrders += week.noOfOrders;
                monthlyTotals.fulfilledOnTime += week.fulfilledOnTime;
                monthlyTotals.fulfilledLate += week.fulfilledLate;
                monthlyTotals.cancelled += week.cancelled;
                monthlyTotals.alertsIssued += week.alertsIssued;
            }

            // Calculate monthly fulfillment rate
            const monthlyTotal = monthlyTotals.fulfilledOnTime + monthlyTotals.fulfilledLate + monthlyTotals.cancelled;
            monthlyTotals.fulfillmentRate = monthlyTotal > 0
                ? `${((monthlyTotals.fulfilledOnTime / monthlyTotal) * 100).toFixed(2)}%`
                : '0.00%';

            res.render('reports/logistics-report', {
                title: 'Order Fulfillment Report',
                css: ['report_landscape.css'],
                layout: 'report',
                month,
                year,
                weeklyData,
                monthlyTotals,
                generatedDate: new Date().toLocaleDateString(),
                downloadUrl: `/reports/logistics/${month}/download/tool`,
                
            });
        } catch (error) {
            console.error('Error generating logistics report:', error);
            res.status(500).send('Error generating logistics report');
        }
    },

    async downloadLogisticsReportUsingTool(req, res) {
        try {

            const month = req.params.month || new Date().toLocaleString('en-US', { month: 'short' });
            const year = new Date().getFullYear();

            // Get the start and end date for the selected month
            const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
            const startDate = new Date(year, monthIndex, 1);
            const endDate = new Date(year, monthIndex + 1, 0);

            // Get all orders for the month
            const orders = await Order.find({
                deliveryDate: {
                    $gte: startDate.toISOString(),
                    $lte: endDate.toISOString()
                }
            }).sort({ deliveryDate: 1 });

            // Group orders by week
            const weeks = {};
            for (const order of orders) {
                const orderDate = new Date(order.deliveryDate);
                const weekNum = Math.ceil((orderDate.getDate() - orderDate.getDay() + 1) / 7);
                if (!weeks[weekNum]) {
                    weeks[weekNum] = {
                        noOfOrders: 0,
                        fulfilledOnTime: 0,
                        fulfilledLate: 0,
                        cancelled: 0,
                        alertsIssued: 0,
                        fulfillmentRate: 0
                    };
                }
                weeks[weekNum].noOfOrders++;

                // Look at the Deliveries Table if a delivery is made for this order
                if (order.status === 'Delivered') {
                    try {
                        // Get all deliveries linked to an order, sort by date with the latest first
                        const deliveries = await Delivery.find({ orderID: order.OrderID }).sort({ deliveryDate: -1 });

                        // Get only the isComplete = true deliveries
                        const completedDeliveries = deliveries.filter(delivery => delivery.isComplete === true);

                        // Get the latest delivery
                        const latestDelivery = completedDeliveries[0] || null;

                        if (latestDelivery) {
                            const scheduledDate = new Date(order.deliveryDate);
                            const actualDeliveryDate = new Date(latestDelivery.deliveryDate);
                            if (actualDeliveryDate <= scheduledDate) {
                                weeks[weekNum].fulfilledOnTime++;
                            } else {
                                weeks[weekNum].fulfilledLate++;
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching delivery for order ${order._id}:`, error);
                    }
                } else if (order.status === 'Cancelled') {
                    weeks[weekNum].cancelled++;
                }
            }

            // Calculate fulfillment rates and format weeks data
            const weeklyData = Object.entries(weeks).map(([weekNum, data]) => {
                const total = data.fulfilledOnTime + data.fulfilledLate + data.cancelled;
                const fulfillmentRate = total > 0
                    ? ((data.fulfilledOnTime + data.fulfilledLate / total) * 100).toFixed(2)
                    : 0;

                return {
                    week: `WEEK ${weekNum}`,
                    ...data,
                    fulfillmentRate: `${fulfillmentRate}%`
                };
            });

            // Calculate monthly totals
            const monthlyTotals = {
                noOfOrders: 0,
                fulfilledOnTime: 0,
                fulfilledLate: 0,
                cancelled: 0,
                alertsIssued: 0,
                fulfillmentRate: '0.00%'
            };

            for (const week of weeklyData) {
                monthlyTotals.noOfOrders += week.noOfOrders;
                monthlyTotals.fulfilledOnTime += week.fulfilledOnTime;
                monthlyTotals.fulfilledLate += week.fulfilledLate;
                monthlyTotals.cancelled += week.cancelled;
                monthlyTotals.alertsIssued += week.alertsIssued;
            }

            // Calculate monthly fulfillment rate
            const monthlyTotal = monthlyTotals.fulfilledOnTime + monthlyTotals.fulfilledLate + monthlyTotals.cancelled;
            monthlyTotals.fulfillmentRate = monthlyTotal > 0
                ? `${((monthlyTotals.fulfilledOnTime / monthlyTotal) * 100).toFixed(2)}%`
                : '0.00%';

            res.render('reports/logistics-report', {
                title: 'Order Fulfillment Report',
                css: ['report_landscape.css'],
                layout: 'report-landscape',
                month,
                year,
                weeklyData,
                monthlyTotals,
                generatedDate: new Date().toLocaleDateString(),
                isDownload: true,
                
            });
        } catch (error) {
            console.error('Error downloading logistics report:', error);
            res.status(500).send('Error downloading logistics report');
        }
    }

};

// Helper functions
async function calculateOrderTotal(order) {
  let total = 0;
  for (const orderItem of order.items) {
      const itemDetails = await Item.findOne({ itemID: orderItem.itemID });
      if (itemDetails) {
          total += orderItem.quantity * itemDetails.itemPrice;
      }
  }
  return total;
}

function getCommonSchedule(orders) {
    const schedules = {};
    orders.forEach(order => {
        schedules[order.deliveryTimeRange] = (schedules[order.deliveryTimeRange] || 0) + 1;
    });
    return Object.entries(schedules)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';
}







module.exports = reportController;