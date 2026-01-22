require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function addUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({
      tenantId: String,
      firstName: String,
      lastName: String,
      email: String,
      password: String,
      role: String,
      isVerified: Boolean,
      isActive: Boolean,
    }, { timestamps: true, strict: false }));

    // Check if user exists
    const existing = await User.findOne({ email: 'user@test.com' });
    if (existing) {
      console.log('User already exists:', existing.email);
      await mongoose.connection.close();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('Password123!', 4);

    // Create user
    const user = await User.create({
      tenantId: 'tenant_default',
      firstName: 'Test',
      lastName: 'User',
      email: 'user@test.com',
      password: hashedPassword,
      role: 'Student',
      isVerified: true,
      isActive: true
    });

    console.log('\n✅ User created successfully!');
    console.log('Email:', user.email);
    console.log('Password: Password123!');
    console.log('Role:', user.role);

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addUser();
