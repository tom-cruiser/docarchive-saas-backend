const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function createStudent() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if student already exists
    const existingStudent = await User.findOne({ email: 'student@example.com' });
    if (existingStudent) {
      console.log('Student already exists:');
      console.log({
        id: existingStudent._id,
        name: `${existingStudent.firstName} ${existingStudent.lastName}`,
        email: existingStudent.email,
        role: existingStudent.role,
        tenantId: existingStudent.tenantId
      });
      await mongoose.connection.close();
      return;
    }

    // Create a new student
    const student = await User.create({
      tenantId: 'tenant_default',
      firstName: 'John',
      lastName: 'Doe',
      email: 'student@example.com',
      password: 'Student123!',
      role: 'Student',
      isVerified: true, // Skip email verification for demo
      isActive: true
    });

    console.log('Student created successfully:');
    console.log({
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
      role: student.role,
      tenantId: student.tenantId
    });
    console.log('\nLogin credentials:');
    console.log('Email: student@example.com');
    console.log('Password: Student123!');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Error creating student:', error.message);
    process.exit(1);
  }
}

createStudent();
