const express = require('express');
const cors = require('cors');
const Stripe = require("stripe");
const db = require('../db/db');
const app = express();
const key = process.env.PRIVATE_KEY;
const stripe = new Stripe(key);
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.set('port', process.env.PORT || 7000);

// Configuración de Swagger
const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Pagos API",
        version: "1.0.0",
        description: "API para gestionar pagos",
      },
      servers: [
        {
          url: "http://localhost:7000", // URL de tu servidor
        },
      ],
    },
    apis: [__filename], // Utiliza __filename para referirte al archivo actual (index.js)
  };
  
  const specs = swaggerJsdoc(options);
  
  // Ruta para la documentación Swagger
  app.use("/docs", swaggerUi.serve);
  app.get("/docs", swaggerUi.setup(specs));

  // Endpoint raíz
app.get('/', (req, res) => {
    res.send('Api de Digital Event Hub');
  });


/**
 * @swagger
 * /pago:
 *   post:
 *     summary: Crea un PaymentIntent con Stripe.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: integer
 *                 description: Monto del pago en centavos.
 *               currency:
 *                 type: string
 *                 description: Moneda del pago (ej. USD).
 *                 enum:
 *                   - "usd"
 *     responses:
 *       '200':
 *         description: Respuesta exitosa. Devuelve el client_secret para confirmar el pago.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Mensaje de confirmación.
 *                 client_secret:
 *                   type: string
 *                   description: Clave secreta del cliente para confirmar el pago.
 *       '500':
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Mensaje de error detallado.
 */
app.post("/pago", async (req, res) => {
    const { body } = req;
  
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: body?.amount,
        currency: body?.currency,
        description: "Gaming Keyboard",
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });
  

      // Realizar la inserción en la base de datos
      const [rows, fields] = await db.execute(
        'INSERT INTO Pagos (monto, fecha, tipo_pago_id, usuario_id, evento_id) VALUES (?, CURDATE(), 1, 1, 1)',
        [body.amount]
      );
  
      const pagoId = rows.insertId;
  
      // Insertar en la tabla Pago_Tarjeta
      await db.execute(
        'INSERT INTO Pago_Tarjeta (numero_tarjeta, fecha_expiracion, cvv, pago_id) VALUES (?, ?, ?, ?)',
        ['1234', '12/25', '123', pagoId]
      );
  
      // Verificar el estado del paymentIntent y enviar la respuesta correspondiente
      if (paymentIntent?.status !== 'completed') {
        return res.status(200).json({
          message: "Confirma tu pago",
          client_secret: paymentIntent?.id,
        });
      } else {
        return res.status(200).json({ message: "Pago completado" });
      }
  
    } catch (error) {
      console.error('Error en el método POST:', error);
      const errorMessage = error.raw?.message || error.message || "Unknown error occurred";
      return res.status(500).json({ message: errorMessage });
    }
  });


/**
 * @swagger
 * /confirmarpago:
 *   post:
 *     summary: Confirma un PaymentIntent con Stripe.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 description: ID del PaymentIntent generado en el endpoint /api/checkout.
 *               paymentMethod:
 *                 type: string
 *                 description: Método de pago utilizado para confirmar el PaymentIntent.
 *                 enum:
 *                   - "pm_card_visa"
 *     responses:
 *       '200':
 *         description: Respuesta exitosa. Devuelve el objeto PaymentIntent confirmado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: ID del PaymentIntent.
 *                 status:
 *                   type: string
 *                   description: Estado del PaymentIntent después de la confirmación.
 *       '500':
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Mensaje de error detallado.
 */
app.post('/confirmarpago', async (req, res) => {
    const { paymentIntentId, paymentMethod } = req.body;
  
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        { payment_method: paymentMethod }
      );
      res.status(200).send(paymentIntent);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });
  


/**
 * @swagger
 * /historialpagos:
 *   get:
 *     summary: Obtiene el historial de pagos
 *     responses:
 *       '200':
 *         description: Respuesta exitosa. Devuelve un array de pagos.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   pago_id:
 *                     type: integer
 *                   monto:
 *                     type: string
 *                   fecha:
 *                     type: string
 *                     format: date
 *                   tipo_pago_id:
 *                     type: integer
 *                   usuario_id:
 *                     type: integer
 *                   evento_id:
 *                     type: integer
 *                   tarjeta:
 *                     type: object
 *                     properties:
 *                       tarjeta_id:
 *                         type: integer
 *                       numero_tarjeta:
 *                         type: string
 *                       fecha_expiracion:
 *                         type: string
 *                         format: date
 *                       cvv:
 *                         type: string
 */

app.get('/historialpagos', (req, res) => {
    db.pool.query(`
      SELECT Pagos.*, Pago_Tarjeta.numero_tarjeta, Pago_Tarjeta.fecha_expiracion, Pago_Tarjeta.cvv
      FROM Pagos
      LEFT JOIN Pago_Tarjeta ON Pagos.pago_id = Pago_Tarjeta.pago_id
    `, (err, results) => {
      if (err) {
          console.log(err);
          res.status(500).send("Error al obtener el historial");
      } else {
          res.json(results);
      }
  });
  });


  app.listen(app.get('port'), () => {
    console.log('Funcionando en:', app.get('port'));
  });
  