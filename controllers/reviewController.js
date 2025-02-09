const Review = require('../models/Review');
const Order = require('../models/Order');
const User = require('../models/User');
const { session } = require('passport');

// Custom error class for review-related errors
class ReviewError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
        this.name = 'ReviewError';
    }
}

const reviewController = {
    // Get review form for a specific order
    async getReviewForm(req, res) {
        try {
            const orderId = parseInt(req.params.orderId);
            if (!orderId) {
                throw new ReviewError('Invalid order ID', 400);
            }

            // Find order and check if it exists
            const order = await Order.findOne({ OrderID: orderId });
            if (!order) {
                throw new ReviewError('Order not found', 404);
            }


            // Check if review already exists
            const existingReview = await Review.findOne({ 
                orderID: orderId,
                reviewerID: req.session.userId 
            });

            if (existingReview) {
                return res.redirect(`/review/view/${existingReview.reviewID}`);
            }

            // Check if order is delivered (can be reviewed)
            if (order.status !== 'Delivered') {
                throw new ReviewError('Order must be delivered before reviewing', 400);
            }

            res.render('review/review-form', {
                title: 'Leave a Review',
                css: ['review.css'],
                layout: 'main',
                order: order,
                js: ['review.js']
            });
        } catch (error) {
            console.error('Error in getReviewForm:', error);
            if (error instanceof ReviewError) {
                res.status(error.status).render('error', {
                    message: error.message,
                    layout: 'main'
                });
            } else {
                res.status(500).render('error', {
                    message: 'An error occurred while loading the review form',
                    layout: 'main'
                });
            }
        }
    },

    // Submit a new review
    async submitReview(req, res) {
        try {
            const {
                orderId,
                overallRating,
                customerServiceRating,
                deliveryRating,
                freshnessRating,
                qualityRating,
                priceRating,
                packagingRating,
                convenienceRating,
                customizationRating,
                comment
            } = req.body;

            // Validate required fields
            if (!orderId || !overallRating) {
                throw new ReviewError('Missing required fields', 400);
            }

            // Validate ratings are between 1-5
            const ratings = [overallRating, customerServiceRating, deliveryRating, 
                          freshnessRating, qualityRating, priceRating, 
                          packagingRating, convenienceRating, customizationRating]
                          .filter(r => r !== undefined);

            if (!ratings.every(r => r >= 1 && r <= 5 && Number.isInteger(Number(r)))) {
                throw new ReviewError('Invalid rating value', 400);
            }

            // Get order and validate
            const order = await Order.findOne({ OrderID: orderId });
            if (!order) {
                throw new ReviewError('Order not found', 404);
            }

            // Check for existing review
            const existingReview = await Review.findOne({
                orderID: orderId,
                reviewerID: req.session.userId
            });

            if (existingReview) {
                throw new ReviewError('Review already exists for this order', 400);
            }

            // Generate next review ID
            const lastReview = await Review.findOne().sort({ reviewID: -1 });
            const nextReviewId = lastReview ? lastReview.reviewID + 1 : 50001;

            // Create review object
            const reviewData = {
                reviewID: nextReviewId,
                reviewerID: req.session.userId,
                orderID: orderId,
                requestID: order.requestID,
                ratings: {
                    overall: Number(overallRating)
                },
                comment: comment?.trim(),
                date: new Date(),
                status: 'pending'
            };

            // Add optional ratings if provided
            if (customerServiceRating) reviewData.ratings.customerService = Number(customerServiceRating);
            if (deliveryRating) reviewData.ratings.delivery = Number(deliveryRating);
            if (freshnessRating) reviewData.ratings.freshness = Number(freshnessRating);
            if (qualityRating) reviewData.ratings.quality = Number(qualityRating);
            if (priceRating) reviewData.ratings.price = Number(priceRating);
            if (packagingRating) reviewData.ratings.packaging = Number(packagingRating);
            if (convenienceRating) reviewData.ratings.convenience = Number(convenienceRating);
            if (customizationRating) reviewData.ratings.customization = Number(customizationRating);

            const review = new Review(reviewData);
            await review.save();

            res.redirect(`/review/view/${review.reviewID}`);
        } catch (error) {
            console.error('Error in submitReview:', error);
            if (error instanceof ReviewError) {
                res.status(error.status).json({ error: error.message });
            } else if (error.name === 'ValidationError') {
                res.status(400).json({ error: 'Invalid review data', details: error.message });
            } else {
                res.status(500).json({ error: 'Failed to submit review' });
            }
        }
    },

    // Get all reviews with filters
    async getAllReviews(req, res) {
        try {
            const filters = {};
            const { category, rating, startDate, endDate, page = 1 } = req.query;
    
            console.log('Received query params:', req.query); // Debug log
    
            // Category filter
            if (category) {
                if (category === 'High Ratings') {
                    filters['ratings.overall'] = { $gte: 4 };
                } else if (category === 'Low Ratings') {
                    filters['ratings.overall'] = { $lte: 2 };
                } else {
                    const categoryToField = {
                        'Customer Service': 'customerService',
                        'Delivery': 'delivery',
                        'Freshness': 'freshness',
                        'Quality': 'quality',
                        'Price': 'price',
                        'Packaging': 'packaging',
                        'Convenience': 'convenience',
                        'Customization': 'customization'
                    };
                    
                    if (categoryToField[category]) {
                        const ratingField = `ratings.${categoryToField[category]}`;
                        filters[ratingField] = { $exists: true, $gt: 0 };
                    }
                }
            }
            
            // Rating filter
            if (rating) {
                filters['ratings.overall'] = { $gte: parseInt(rating) };
            }
    
            // Date range filter
            if (startDate || endDate) {
                filters.date = {};
                if (startDate) {
                    filters.date.$gte = new Date(startDate);
                }
                if (endDate) {
                    const endDateTime = new Date(endDate);
                    endDateTime.setHours(23, 59, 59, 999);
                    filters.date.$lte = endDateTime;
                }
            }
    
            console.log('Applied MongoDB filters:', JSON.stringify(filters, null, 2)); // Debug log
    
            // Pagination
            const limit = 10;
            const skip = (parseInt(page) - 1) * limit;
    
            // Execute queries
            const [reviews, totalReviews, averageRatings] = await Promise.all([
                Review.find(filters)
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Review.countDocuments(filters),
                Review.getAverageRatings()
            ]);
    
            console.log(`Found ${reviews.length} reviews matching filters`); // Debug log
    
            const totalPages = Math.ceil(totalReviews / limit);

            const isSalesTeam = req.session.userType === 'Sales';
            console.log('isSalesTeam:', isSalesTeam);

            const isCustomer = req.session.userType === 'Customer';
            console.log('isCustomer:', isCustomer);


            let layoutString = 'main';

            //If usertype is Sales, layoutString is 'sales'
            if (req.user.usertype === 'Sales') {
                layoutString = 'sales';
            } else if (req.user.usertype === 'Customer') {
                layoutString = 'customer';
            } else if(req.user.usertype === 'Logistics') {
                layoutString = 'logistics';
            }
    
            res.render('review/review-dashboard', {
                title: 'Review Dashboard',
                css: ['review.css'],
                layout: layoutString,
                reviews,
                averageRatings,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    hasNextPage: parseInt(page) < totalPages,
                    hasPrevPage: parseInt(page) > 1
                },
                activeFilters: {
                    category,
                    rating,
                    startDate,
                    endDate
                },
                isSalesTeam,
                isCustomer,
                active: 'reviews',
            });
        } catch (error) {
            console.error('Error in getAllReviews:', error);
            res.status(500).render('error', {
                message: 'An error occurred while loading reviews',
                error: error.toString(),
                layout: 'main'
            });
        }
    },

    // View a single review
    async getReview(req, res) {
        try {
            const reviewId = parseInt(req.params.reviewId);
            if (!reviewId) {
                throw new ReviewError('Invalid review ID', 400);
            }

            const review = await Review.findOne({ reviewID: reviewId }).lean();
            
            if (!review) {
                throw new ReviewError('Review not found', 404);
            }

            // Get reviewer and order details
            const [reviewer, order] = await Promise.all([
                User.findOne({ userID: review.reviewerID }).lean(),
                Order.findOne({ OrderID: review.orderID }).lean()
            ]);

            if (!order) {
                throw new ReviewError('Associated order not found', 404);
            }

            // Check access permissions
            const userId = req.session.userId;
            const userType = req.session.userType;
            const hasAccess = userType === 'Sales' || 
                            review.reviewerID === userId || 
                            order.customerID === userId;

            if (!hasAccess) {
                throw new ReviewError('Unauthorized to view this review', 403);
            }

            res.render('review/review-detail', {
                title: 'Review Details',
                css: ['review.css'],
                layout: 'main',
                review: review,
                reviewer: reviewer,
                order: order,
                js: ['review.js'],
                session: req.session
                
            });
        } catch (error) {
            console.error('Error in getReview:', error);
            if (error instanceof ReviewError) {
                res.status(error.status).render('error', {
                    message: error.message,
                    layout: 'main'
                });
            } else {
                res.status(500).render('error', {
                    message: 'An error occurred while loading the review',
                    layout: 'main'
                });
            }
        }
    },

    // Respond to a review (sales team only)
    async respondToReview(req, res) {
        try {
            const { reviewId } = req.params;
            const { response } = req.body;

            if (!response || !response.trim()) {
                return res.status(400).json({ error: 'Response text is required' });
            }

            const result = await Review.updateOne(
                { reviewID: parseInt(reviewId) },
                {
                    $set: {
                        response: {
                            'text': response.trim(),
                            'respondedBy': req.session.userId,
                            'responseDate': new Date(),
                            
                        }

                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Review not found' });
            }

            if (result.modifiedCount === 0) {
                return res.status(400).json({ error: 'Failed to update review' });
            }

            res.json({ 
                success: true, 
                message: 'Response added successfully'
            });

        } catch (error) {
            console.error('Error responding to review:', error);
            res.status(500).json({ error: 'Failed to save response' });
        }
    },


    // Get customer's reviews
    async getCustomerReviews(req, res) {
        try {
            const customerId = req.session.userId;
            const reviews = await Review.find({ reviewerID: customerId })
                .sort({ date: -1 })
                .lean();

            const orders = await Order.find({
                OrderID: { $in: reviews.map(r => r.orderID) }
            }).lean();

            // Add order info to reviews
            const reviewsWithOrders = reviews.map(review => ({
                ...review,
                order: orders.find(o => o.OrderID === review.orderID)
            }));

            res.render('review/customer-reviews', {
                title: 'My Reviews',
                css: ['review.css', "customer.css"],
                layout: 'customer',
                reviews: reviewsWithOrders,
                js: ['review.js'],
                active: 'reviews'
            });
        } catch (error) {
            console.error('Error in getCustomerReviews:', error);
            res.status(500).render('error', {
                message: 'An error occurred while loading your reviews',
                layout: 'main'
            });
        }
    },

    // Get edit form
    async getEditForm(req, res) {
        try {
            const reviewId = parseInt(req.params.reviewId);
            if (!reviewId) {
                throw new ReviewError('Invalid review ID', 400);
            }

            const review = await Review.findOne({ 
                reviewID: reviewId,
                reviewerID: req.session.userId
            });

            if (!review) {
                throw new ReviewError('Review not found or unauthorized', 404);
            }

            // Check if review can be edited (no response)
            if (review.response?.text) {
                throw new ReviewError('Cannot edit review after response', 400);
            }


            const order = await Order.findOne({ OrderID: review.orderID });
            if (!order) {
                throw new ReviewError('Associated order not found', 404);
            }

            res.render('review/review-form', {
                title: 'Edit Review',
                css: ['review.css'],
                layout: 'main',
                review: review,
                order: order,
                isEditing: true,
                js: ['review.js']
            });
        } catch (error) {
            console.error('Error in getEditForm:', error);
            if (error instanceof ReviewError) {
                res.status(error.status).render('error', {
                    message: error.message,
                    layout: 'main'
                });
            } else {
                res.status(500).render('error', {
                    message: 'An error occurred while loading the edit form',
                    layout: 'main'
                });
            }
        }
    },

    // Update review
    async updateReview(req, res) {
        try {
            const reviewId = parseInt(req.params.reviewId);
            const userId = req.session.userId;

            if (!reviewId) {
                throw new ReviewError('Invalid review ID', 400);
            }

            const review = await Review.findOne({ 
                reviewID: reviewId,
                reviewerID: userId
            });

            if (!review) {
                throw new ReviewError('Review not found or unauthorized', 404);
            }

            // Check if review can be edited
            if (review.response?.text) {
                throw new ReviewError('Cannot edit review after response', 400);
            }

 

            const {
                overallRating,
                customerServiceRating,
                deliveryRating,
                freshnessRating,
                qualityRating,
                priceRating,
                packagingRating,
                convenienceRating,
                customizationRating,
                comment
            } = req.body;

            // Validate required fields
            if (!overallRating) {
                throw new ReviewError('Overall rating is required', 400);
            }

            // Validate ratings are between 1-5
            const ratings = [overallRating, customerServiceRating, deliveryRating, 
                          freshnessRating, qualityRating, priceRating, 
                          packagingRating, convenienceRating, customizationRating]
                          .filter(r => r !== undefined);

            if (!ratings.every(r => r >= 1 && r <= 5 && Number.isInteger(Number(r)))) {
                throw new ReviewError('Invalid rating value', 400);
            }

            // Update ratings object
            const updatedRatings = {
                overall: Number(overallRating)
            };

            // Only update optional ratings if provided
            if (customerServiceRating) updatedRatings.customerService = Number(customerServiceRating);
            if (deliveryRating) updatedRatings.delivery = Number(deliveryRating);
            if (freshnessRating) updatedRatings.freshness = Number(freshnessRating);
            if (qualityRating) updatedRatings.quality = Number(qualityRating);
            if (priceRating) updatedRatings.price = Number(priceRating);
            if (packagingRating) updatedRatings.packaging = Number(packagingRating);
            if (convenienceRating) updatedRatings.convenience = Number(convenienceRating);
            if (customizationRating) updatedRatings.customization = Number(customizationRating);

            // Update the review
            review.ratings = updatedRatings;
            review.comment = comment?.trim() || '';
            review.status = 'pending'; // Reset status for re-approval
            review.updatedAt = new Date();

            await review.save();

            // Redirect to the review detail page with success message
            req.flash('success', 'Review updated successfully');
            res.redirect(`/review/view/${review.reviewID}`);
        } catch (error) {
            console.error('Error in updateReview:', error);
            if (error instanceof ReviewError) {
                req.flash('error', error.message);
                res.redirect(`/review/edit/${req.params.reviewId}`);
            } else if (error.name === 'ValidationError') {
                req.flash('error', 'Invalid review data');
                res.redirect(`/review/edit/${req.params.reviewId}`);
            } else {
                req.flash('error', 'Failed to update review');
                res.redirect(`/review/edit/${req.params.reviewId}`);
            }
        }
    },

 // In reviewController.js
async deleteReview(req, res) {
    try {
        const reviewId = parseInt(req.params.reviewId);
        if (!reviewId) {
            return res.status(400).json({ error: 'Invalid review ID' });
        }

        const review = await Review.findOneAndDelete({ reviewID: reviewId });
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Failed to delete review' });
    }
},

    // Get review statistics
    async getReviewStats(req, res) {
        try {
            const userId = req.session.userId;
            const userType = req.session.userType;

            let filters = {};
            if (userType === 'Customer') {
                filters.reviewerID = userId;
            }

            const stats = await Review.aggregate([
                { $match: filters },
                {
                    $group: {
                        _id: null,
                        totalReviews: { $sum: 1 },
                        avgOverallRating: { $avg: '$ratings.overall' },
                        ratingDistribution: {
                            $push: '$ratings.overall'
                        },
                        categoryBreakdown: {
                            $push: {
                                customerService: '$ratings.customerService',
                                delivery: '$ratings.delivery',
                                freshness: '$ratings.freshness',
                                quality: '$ratings.quality',
                                price: '$ratings.price',
                                packaging: '$ratings.packaging',
                                convenience: '$ratings.convenience',
                                customization: '$ratings.customization'
                            }
                        }
                    }
                }
            ]);

            // Process rating distribution
            const ratingDistribution = stats[0]?.ratingDistribution.reduce((acc, rating) => {
                acc[rating] = (acc[rating] || 0) + 1;
                return acc;
            }, {});

            // Process category breakdown
            const categoryBreakdown = {};
            const categories = ['customerService', 'delivery', 'freshness', 'quality', 
                              'price', 'packaging', 'convenience', 'customization'];

            categories.forEach(category => {
                const ratings = stats[0]?.categoryBreakdown
                    .map(breakdown => breakdown[category])
                    .filter(rating => rating !== undefined);

                if (ratings.length > 0) {
                    categoryBreakdown[category] = {
                        average: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
                        count: ratings.length
                    };
                }
            });

            res.json({
                totalReviews: stats[0]?.totalReviews || 0,
                averageRating: stats[0]?.avgOverallRating || 0,
                ratingDistribution,
                categoryBreakdown
            });
        } catch (error) {
            console.error('Error in getReviewStats:', error);
            res.status(500).json({ error: 'Failed to fetch review statistics' });
        }
    }
};

module.exports = reviewController;