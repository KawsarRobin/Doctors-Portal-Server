const express = require('express');
const app = express();
const cors = require('cors');
const admin = require('firebase-admin');
const port = process.env.PORT || 5000;
require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const fileUpload = require('express-fileupload');

// doctors-portal-adminsdk.json

const serviceAccount = require(`./doctors-portal-adminsdk.json`);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//Middle ware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b4g6x.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req?.headers?.authorization?.startsWith('bearer ')) {
    const token = req?.headers?.authorization?.split(' ')[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }

  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db('doctors-portal');
    const appointmentCollection = database.collection('appointments');
    const usersCollection = database.collection('users');
    const doctorsCollection = database.collection('doctors');

    app.get('/doctors', async (req, res) => {
      const cursor = doctorsCollection.find({});
      const result = await cursor.toArray();
      res.json(result);
    });

    //Post a doctor
    app.post('/doctors', async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedImg = picData.toString('base64');
      const imageBuffer = Buffer.from(encodedImg, 'base64');
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    app.get('/appointments', verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = new Date(req.query.date).toLocaleDateString();
      const query = { email: email, date: date };
      const cursor = appointmentCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });

    //search admin or not
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === 'admin') {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });

    //Search appointment by id
    app.get('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentCollection.findOne(query);
      res.json(result);
    });

    app.post('/appointments', async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment);
      res.json(result);
    });

    app.put('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentCollection.updateOne(filter, updateDoc);

      res.json(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.put('/users', async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    //admin making
    app.put('/users/makeAdmin', verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });

        if (requesterAccount.role === 'admin') {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: 'admin' } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ massage: 'You do not have access to make admin' });
      }
    });

    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
    // await.client.close()
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello doctors portal');
});
app.listen(port, () => {
  console.log('listening to the port', port);
});
