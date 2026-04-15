-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 24, 2025 at 12:00 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ffcoffee`
--

-- --------------------------------------------------------

--
-- Table structure for table `admins`
--

CREATE TABLE `admins` (
  `id` int(11) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `reset_code` varchar(6) DEFAULT NULL,
  `reset_expiry` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admins`
--

INSERT INTO `admins` (`id`, `username`, `email`, `password`, `reset_code`, `reset_expiry`) VALUES
(1, 'bazzy', 'manzidelphin18@gmail.com', '$2b$10$qFEFBGqLvb.MBzg2aOiyTuLXzAm4yd9rHShX/oys8d/k7QRyMitfS', NULL, NULL),
(2, 'manzibazzy', 'manzidelphin1@gmail.com', '$2a$10$wZKWu.s/ZzFf/pNIWdvaIO4SSUFqhAFjGnnbeeuwog5LyIA97eRzO', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `id` int(11) NOT NULL,
  `table_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `num_people` int(11) NOT NULL,
  `order_food` enum('Yes','No') DEFAULT 'No',
  `foods` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`foods`)),
  `total_price` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` enum('Pending','Accepted','Rejected') DEFAULT 'Pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`id`, `table_id`, `name`, `email`, `phone`, `num_people`, `order_food`, `foods`, `total_price`, `created_at`, `updated_at`, `status`) VALUES
(8, 5, 'manzi', 'manzidelphin18@gmail.com', '0736322662', 1, 'No', NULL, 0.00, '2025-10-15 16:31:10', '2025-10-15 18:14:32', 'Accepted');

-- --------------------------------------------------------

--
-- Table structure for table `booking_foods`
--

CREATE TABLE `booking_foods` (
  `id` int(11) NOT NULL,
  `booking_id` int(11) NOT NULL,
  `food_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu`
--

CREATE TABLE `menu` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('food','drink') NOT NULL,
  `category` enum('breakfast','lunch','dinner') NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `currency` enum('RWF','$') NOT NULL,
  `description` text DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `menu`
--

INSERT INTO `menu` (`id`, `name`, `type`, `category`, `price`, `currency`, `description`, `image`) VALUES
(2, 'inanasi', 'food', 'breakfast', 1333.00, 'RWF', 'edtrgyujhkhl;,\'.\'loi', '/uploads/1759587464033_noir-N3p9BsO-6E4-unsplash.jpg'),
(3, 'bried', 'food', 'breakfast', 1500.00, 'RWF', 'umugati mwiza', '/uploads/1759587841503_pexels-atomlaborblog-1002322.jpg'),
(4, 'coffee', 'food', 'breakfast', 2500.00, 'RWF', 'good coffee', '/uploads/1759587903646_pexels-chevanon-312418.jpg'),
(5, 'black coffee', 'food', 'breakfast', 2300.00, 'RWF', 'nice one coffee', '/uploads/1759587940081_pexels-lood-goosen-508841-1235706.jpg'),
(6, 'coffee', 'food', 'breakfast', 2344.00, '$', 'common bried ', '/uploads/1759588564530_pexels-pixabay-209206.jpg'),
(7, 'chafffa', 'food', 'breakfast', 34567.00, 'RWF', 'nose beke', '/uploads/1759588589898_pexels-pixabay-267308.jpg'),
(8, 'mayise coffee', 'drink', 'breakfast', 4000.00, 'RWF', 'hjghgvjhbkjn', '/uploads/1759588629786_pexels-chevanon-312418.jpg'),
(11, 'common', 'food', 'breakfast', 220.00, 'RWF', 'xdfcgvhjlkml', '/uploads/1759589470084_pexels-pixabay-209206.jpg');

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `buyer_name` varchar(255) DEFAULT NULL,
  `food_name` varchar(255) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `prepStart` datetime DEFAULT NULL,
  `prepFinish` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_read` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_notifications`
--

CREATE TABLE `order_notifications` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `buyer_name` varchar(255) NOT NULL,
  `status` varchar(50) NOT NULL,
  `message` text DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` int(11) DEFAULT NULL,
  `method` varchar(50) DEFAULT NULL,
  `paid_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchases`
--

CREATE TABLE `purchases` (
  `id` int(11) NOT NULL,
  `menu_id` int(11) NOT NULL,
  `buyer_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `order_type` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tables`
--

CREATE TABLE `tables` (
  `id` int(11) NOT NULL,
  `table_number` varchar(50) NOT NULL,
  `table_image` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tables`
--

INSERT INTO `tables` (`id`, `table_number`, `table_image`, `created_at`) VALUES
(1, '8', '/uploads/1763958559320.jpg', '2025-11-24 04:29:19'),
(5, '1', '/uploads/1763965941040.webp', '2025-11-24 06:30:06');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `profileImage` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `phone`, `password`, `profileImage`, `created_at`) VALUES
(1, 'MANZI DELPHIN', 'manzidelphin18@gmail.com', '0796403913', '$2a$10$kck1SVtN2AimyZedjRE9reBAK3JoupQ6ElOSGT3PzG2yHbuKpC1mS', '/uploads/profiles/1763837663827.jpg', '2025-11-22 18:53:48'),
(2, 'BAZZY MANZI', 'bazzymanzi@gmail.com', '0796403912', '$2a$10$s4LJZBmR3nEfGtK2n.l60.KK.pPYa3EIUeGI1wstLI.Mopkka611i', '/uploads/profiles/1763890574455.jpg', '2025-11-23 09:03:23');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admins`
--
ALTER TABLE `admins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `booking_foods`
--
ALTER TABLE `booking_foods`
  ADD PRIMARY KEY (`id`),
  ADD KEY `booking_id` (`booking_id`),
  ADD KEY `food_id` (`food_id`);

--
-- Indexes for table `menu`
--
ALTER TABLE `menu`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `order_notifications`
--
ALTER TABLE `order_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `purchases`
--
ALTER TABLE `purchases`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tables`
--
ALTER TABLE `tables`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `table_number` (`table_number`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admins`
--
ALTER TABLE `admins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `booking_foods`
--
ALTER TABLE `booking_foods`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `menu`
--
ALTER TABLE `menu`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `order_notifications`
--
ALTER TABLE `order_notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `purchases`
--
ALTER TABLE `purchases`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tables`
--
ALTER TABLE `tables`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `booking_foods`
--
ALTER TABLE `booking_foods`
  ADD CONSTRAINT `booking_foods_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `booking_foods_ibfk_2` FOREIGN KEY (`food_id`) REFERENCES `menu` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
