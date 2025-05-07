import Order from "../models/Order.js";
import Product from "../models/Product.js";
import stripe from "stripe";
import User from "../models/User.js";

//place order cod : /api/order/cod
export const placeOrderCOD = async (req, res) => {
  try {
    const { userId, items, address } = req.body;

    // ✅ 1. STRICT INPUT VALIDATION
    if (!userId || !address || !items || items.length === 0) {
      return res.json({ success: false, message: "Invalid order data" });
    }

    let amount = 0;

    // ✅ 2. CHECK EACH ITEM HAS A VALID PRODUCT ID
    for (const item of items) {
      if (!item.product || typeof item.product !== 'string') {
        return res.json({ 
          success: false, 
          message: "Invalid product ID in cart" 
        });
      }

      const product = await Product.findById(item.product);
      
      // ✅ 3. CHECK IF PRODUCT EXISTS & HAS VALID PRICE
      if (!product) {
        return res.json({ 
          success: false, 
          message: `Product ${item.product} not found` 
        });
      }
      if (!product.offerPrice || product.offerPrice <= 0) {
        return res.json({ 
          success: false, 
          message: `Product ${product.name} has invalid pricing` 
        });
      }

      amount += product.offerPrice * item.quantity;
    }

    // ✅ 4. ADD TAX (FLOORED TO AVOID DECIMAL ISSUES)
    amount += Math.floor(amount * 0.02);

    // ✅ 5. CREATE ORDER
    await Order.create({
      userId,
      items,
      amount,
      address,
      paymentType: "COD",
    });

    return res.json({ success: true, message: "Order Placed Successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};




//stripe
//place order stripe : /api/order/stripe
export const placeOrderStripe = async (req, res) => {
  try {
    const { userId, items, address } = req.body;
    const {origin} = req.headers;

    
    if (!userId || !address || !items || items.length === 0) {
      return res.json({ success: false, message: "Invalid order data" });
    }

    let productData = [];

    let amount = 0;

    // ✅ 2. CHECK EACH ITEM HAS A VALID PRODUCT ID
    for (const item of items) {
      if (!item.product || typeof item.product !== 'string') {
        return res.json({ 
          success: false, 
          message: "Invalid product ID in cart" 
        });
      }

      const product = await Product.findById(item.product);
      productData.push({
        name: product.name,
        price: product.offerPrice,
        quantity: item.quantity,
    });
      
      
      if (!product) {
        return res.json({ 
          success: false, 
          message: `Product ${item.product} not found` 
        });
      }
      if (!product.offerPrice || product.offerPrice <= 0) {
        return res.json({ 
          success: false, 
          message: `Product ${product.name} has invalid pricing` 
        });
      }

      amount += product.offerPrice * item.quantity;
    }

    // ✅ 4. ADD TAX (FLOORED TO AVOID DECIMAL ISSUES)
    amount += Math.floor(amount * 0.02);

    // ✅ 5. CREATE ORDER
    const order = await Order.create({
      userId,
      items,
      amount,
      address,
      paymentType: "Online",
    });

//stripe gateway initialized
const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

// create line items for stripe 
const line_items = productData.map((item) => {
  return {
    price_data: {
      currency: "USD",
      product_data: {
        name: item.name,
      },
      unit_amount: Math.floor(item.price + item.price * 0.02) * 100, // Stripe expects the amount in cents
    },
    quantity: item.quantity,
  };
}
)
// create checkout session
 const session = await stripeInstance.checkout.sessions.create({
  line_items,
  mode: "payment",
  success_url: `${origin}/loader?next=my-orders`,
  cancel_url: `${origin}/cart`,
  metadata: {
    orderId: order._id.toString(), // Store the order ID in metadata
    userId,
  },
 })


    return res.json({ success: true, url: session.url });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
// STRIPE WEBHOOKS TO VERIFY PAYMENTS ACTION: /stripe
export const stripeWebhooks = async (request, response) => {
  //stripe gateway initialized
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

  const sig = request.headers['stripe-signature'];
  let event ;
   try {
    event = stripeInstance.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
   } catch (error) {
    response.status(400).send(`Webhook Error: ${error.message}`)
   }
    // Handle the event
   switch(event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;

      //getting session id from metadata
      const session = await stripeInstance.checkout.sessions.list({payment_intent: paymentIntentId,});

    const {orderId, userId} = session.data[0].metadata;
      //mark payment paid in order
      await Order.findByIdAndUpdate(orderId,{isPaid: true}) 
      //clear cart after payment
      await User.findByIdAndUpdate(userId, {cartItems: {}});
    break;
   
    case 'payment_intent.payment_failed':{
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;

      //getting session id from metadata
      const session = await stripeInstance.checkout.sessions.list({payment_intent: paymentIntentId,});

    const {orderId} = session.data[0].metadata;
    await Order.findByIdAndDelete(orderId); // Delete the order if payment fails
    break;
    }
    default:
      console.error(`Unhandled event type ${event.type}`)
      break;
  }
  response.json({received: true});
}



//get orders by user id : /api/order/user
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    
    const orders = await Order.find({ userId })
      .populate({
        path: 'items.product',
        model: 'product',
        select: 'name image offerPrice category' // Only get needed fields
      })
      .populate({
        path: 'address',
        model: 'address',
        select: 'street city state country' // Only get needed fields
      })
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      orders: orders.map(order => ({
        ...order._doc,
        amount: order.amount.toFixed(2) // Ensure proper decimal format
      }))
    });
    
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
};
//get all orders ( for seller / admin) : /api/order/seller
export const getAllOrders = async (req, res)=>{
  try {
    const orders = await Order.find({
      $or:[{paymentType: "COD"}, {isPaid: true}]
    }).populate("items.product address").sort({createdAt: -1});
    res.json({success:true, orders});
  } catch (error) {
    res.json({ success: false, message: error.message});

  }
}