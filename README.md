# Tools Australia - Ecommerce Rewards Website

A fullstack ecommerce platform built with Next.js 15, featuring a comprehensive rewards system, membership packages, and tool giveaways.

## 🚀 Features

### Core Ecommerce

- **Product Catalog**: Browse tools, equipment, and accessories with advanced search and filtering
- **Shopping Cart**: Add to cart, quantity management, and checkout process
- **Order Management**: Track orders, view order history, and manage returns
- **Payment Processing**: Secure payments via Stripe integration

### Rewards & Membership System

- **Membership Packages**:
  - Subscription packages (Tradie, Foreman, Boss)
  - One-time packages (Apprentice Pack, Tradie Pack, Boss Pack)
  - Additional member packages for subscribed users
- **Points System**: Earn points through purchases and activities
- **Giveaway Entries**: Accumulate entries for monthly giveaways
- **Exclusive Discounts**: Member-only pricing and deals

### User Features

- **Authentication**: Email/Google login with NextAuth.js
- **User Dashboard**: Track points, entries, membership tier, and purchases
- **Personalized Recommendations**: AI-powered product suggestions
- **Order History**: Complete purchase tracking and management

### Admin Features

- **Product Management**: Add, edit, archive products with bulk operations
- **Sales Analytics**: Track sales, rewards, and giveaway entries
- **Member Management**: View and edit member profiles
- **Giveaway Management**: Create and manage monthly giveaways

### Facebook Integration

- **Meta Tracking**: Facebook Pixel integration for ad tracking
- **Conversion Tracking**: API endpoint for sending member details to Facebook Ads API
- **Custom Audiences**: Build audiences based on user behavior

## 🛠 Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Backend**: Next.js API Routes with server-side rendering
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: NextAuth.js (Email + Google providers)
- **Payments**: Stripe integration
- **State Management**: React Query for client-side data fetching
- **Validation**: Zod for request validation
- **Icons**: Lucide React
- **Deployment**: Vercel-ready

## 📁 Project Structure

```
tools-australia/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── auth/          # Authentication endpoints
│   │   │   ├── products/      # Product management
│   │   │   ├── cart/          # Shopping cart
│   │   │   ├── orders/        # Order management
│   │   │   ├── memberships/   # Membership packages
│   │   │   ├── giveaways/     # Giveaway system
│   │   │   ├── stripe/        # Payment processing
│   │   │   └── facebook/      # Facebook integration
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Homepage
│   │   └── providers.tsx      # Context providers
│   ├── components/            # Reusable UI components
│   │   ├── Header.tsx         # Site header with navigation
│   │   ├── Hero.tsx           # Hero section
│   │   ├── ProductCard.tsx    # Product display card
│   │   ├── ProductSection.tsx # Product collections
│   │   ├── MembershipSection.tsx # Membership packages
│   │   └── Footer.tsx         # Site footer
│   ├── lib/                   # Utility libraries
│   │   ├── mongodb.ts         # Database connection
│   │   ├── auth.ts            # NextAuth configuration
│   │   └── stripe.ts          # Stripe client
│   ├── models/                # Mongoose schemas
│   │   ├── User.ts            # User model
│   │   ├── Product.ts         # Product model
│   │   ├── Order.ts           # Order model
│   │   ├── MembershipPackage.ts # Membership model
│   │   └── Giveaway.ts        # Giveaway model
│   └── types/                 # TypeScript type definitions
│       └── global.d.ts        # Global type declarations
├── public/                    # Static assets
├── tailwind.config.ts         # Tailwind configuration
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies
└── README.md                  # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or cloud)
- Stripe account
- Google OAuth credentials (optional)
- Facebook Pixel ID (optional)

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd tools-australia
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp env.example .env.local
   ```

   Fill in your environment variables in `.env.local`:

   - MongoDB connection string
   - NextAuth secret
   - Stripe keys
   - Google OAuth credentials (optional)
   - Facebook Pixel ID (optional)

4. **Set up the database**

   - Start MongoDB locally or use MongoDB Atlas
   - The app will automatically create collections on first run

5. **Run the development server**

   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Configuration

### Database Setup

The app uses MongoDB with the following collections:

- `users` - User accounts and profiles
- `products` - Product catalog
- `orders` - Order history
- `membershippackages` - Membership tiers and packages
- `giveaways` - Giveaway campaigns

### Stripe Setup

1. Create a Stripe account
2. Get your API keys from the Stripe dashboard
3. Set up webhooks for payment processing
4. Configure products and prices in Stripe dashboard

### Facebook Integration

1. Create a Facebook Business account
2. Set up Facebook Pixel
3. Get your Pixel ID and Access Token
4. Configure conversion tracking

## 📱 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Products

- `GET /api/products` - List all products
- `POST /api/products` - Create product (admin)
- `GET /api/products/[id]` - Get product by ID
- `PUT /api/products/[id]` - Update product (admin)
- `DELETE /api/products/[id]` - Delete product (admin)
- `GET /api/products/search` - Search products
- `GET /api/products/featured` - Get featured products
- `GET /api/products/bestsellers` - Get best sellers

### Cart & Orders

- `GET /api/cart` - Get user cart
- `POST /api/cart` - Add to cart
- `PUT /api/cart` - Update cart
- `DELETE /api/cart` - Remove from cart
- `GET /api/orders` - Get user orders
- `POST /api/orders` - Create order

### Memberships

- `GET /api/memberships` - List membership packages
- `POST /api/memberships` - Create package (admin)
- `GET /api/memberships/[id]` - Get package details

### Giveaways

- `GET /api/giveaways` - List giveaways
- `POST /api/giveaways` - Create giveaway (admin)
- `POST /api/giveaways/[id]` - Enter giveaway

### Stripe

- `POST /api/stripe/create-payment-intent` - Create payment
- `POST /api/stripe/webhook` - Handle webhooks

### Facebook

- `POST /api/facebook/track` - Track events

## 🎨 Design System

The app follows a consistent design system with:

- **Colors**: Red primary (#EE0000), dark gray secondary (#2B2D37)
- **Typography**: Inter and Poppins fonts
- **Components**: Reusable UI components with consistent styling
- **Responsive**: Mobile-first design approach

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push

### Other Platforms

The app can be deployed to any platform that supports Next.js:

- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## 📊 Analytics & Tracking

- **Facebook Pixel**: Track user behavior and conversions
- **Google Analytics**: Monitor site performance (optional)
- **Custom Events**: Track membership signups, purchases, and giveaway entries

## 🔒 Security

- **Authentication**: Secure user authentication with NextAuth.js
- **API Security**: Request validation with Zod
- **Data Protection**: Secure database connections
- **Payment Security**: PCI-compliant payments via Stripe

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email hello@toolsaustralia.com.au or create an issue in the repository.

## 🗺 Roadmap

- [ ] Admin dashboard UI
- [ ] Advanced analytics
- [ ] Mobile app
- [ ] Multi-language support
- [ ] Advanced search with filters
- [ ] Wishlist functionality
- [ ] Product reviews and ratings
- [ ] Loyalty program enhancements
