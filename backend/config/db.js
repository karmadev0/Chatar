import mongoose from 'mongoose';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB conectado:', conn.connection.name);
  } catch (err) {
    console.error('❌ Error conectando MongoDB:', err.message);
    process.exit(1);
  }
}
