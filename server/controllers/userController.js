import User from "../models/User.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';


//Register user /api/user/register
export const register = async (req, res)=>{

  try {
    const {name, email , password} = req.body;
    if(!name || !email || !password){
      return res.json({success:false, message: 'Missing Details'})
    }
    const existingUser = await User.findOne({email})

    if(existingUser)
      return res.json({success:false, message: 'User Already exists'})

    const hashedPassword = await bcrypt.hash(password, 10)

    const user= await User.create({name, email, password: hashedPassword})
    const token = jwt.sign({id: user._id}, process.env.JWT_SECRET,{expiresIn: '7d'})
    res.cookie('token',token, {
      httpOnly: true, //prevent javascript to access cookie
      secure: process.env.NODE_ENV === 'production',//use secure cookie in production
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',//CSRF protection
      maxAge: 7* 24* 60* 60* 1000, //cookie expiration time
    })

    return res.json({success:true, user:{email: user.email, name: user.name}})
  } catch (error) {
    console.log(error.message);
    res.json({success:false, message:error.message });
  }




}