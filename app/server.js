import express from "express";

const app = express();

app.use(express.json());

app.post("/api/wishlist-add", (req, res) => {

  console.log("Wishlist API hit");

  res.json({
    message: "Wishlist saved"
  });

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});