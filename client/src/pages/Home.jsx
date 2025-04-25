import React from 'react'
import MainBanner from '../componenets/MainBanner'
import Categories from '../componenets/Categories'
import Bestseller from '../componenets/Bestseller'
import BottomBanner from '../componenets/BottomBanner'
import NewsLetter from '../componenets/NewsLetter'


const Home = () => {
  return (
    <div className='mt-10'>
        <MainBanner/>
        <Categories/>
        <Bestseller/>
        <BottomBanner/>
        <NewsLetter/>
        
    </div>
  )
}

export default Home