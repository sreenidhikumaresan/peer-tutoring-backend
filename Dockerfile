# Use an official lightweight Node.js image
FROM node:18-alpine

# Create and set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Command to run the application
CMD [ "node", "server.js" ]