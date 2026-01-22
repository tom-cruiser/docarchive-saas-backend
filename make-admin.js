const mongoose = require('mongoose');
require('dotenv').config();

const makeAdmin = async (email) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const User = require('./src/models/User');

    if (!email) {
      console.log('Usage: node make-admin.js <user-email>');
      console.log('\nExample: node make-admin.js tomyrret@gmail.com');
      process.exit(1);
    }

    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ User with email "${email}" not found`);
      process.exit(1);
    }

    if (user.role === 'Admin') {
      console.log(`ℹ️  User "${email}" is already an Admin`);
      process.exit(0);
    }

    const oldRole = user.role;
    user.role = 'Admin';
    await user.save();

    console.log('✅ User promoted to Admin successfully!\n');
    console.log('User Details:');
    console.log(`  Name: ${user.firstName} ${user.lastName}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Old Role: ${oldRole}`);
    console.log(`  New Role: Admin`);
    console.log(`  Tenant ID: ${user.tenantId}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
};

const email = process.argv[2];
makeAdmin(email);
