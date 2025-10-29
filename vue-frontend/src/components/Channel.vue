<script setup>
import qs from 'qs'
</script>

<template>
    <div>
        <h1>Channel</h1>
        <h2>{{ channel_name }}</h2>
        <h3>owner: {{ channel_owner }}</h3>
    </div><br>
    <div>
        <button @click="join()">Join</button>
    </div><br>
    
    <form @submit.prevent="changeName">
        <label for="newChannelName">New Channel Name:</label>
        <input type="text" id="newChannelName" required/>

        <button type="submit">Change name</button>
    </form><br>

    <div v-for="(message, index) in messages" :key="index">
        <p>{{ message.pengguna_id.username }} : {{ message.message }}</p>
         
    </div><br><br>

    <form @submit.prevent="sendMessage">
        <label for="message">Message:</label>
        <input type="text" id="message" required/>

        <button type="submit">send</button>
    </form>
    
</template>

<script>
    export default {
        data() {
            return {
                user_id: null,
                channel_id: null,
                channel_name: null,
                channel_owner: null,
                messages: [],
                intervalId: null,
            }
        },
        methods: {
            async getChannelInfo(){
                this.channel_id = this.$route.params.channel_id
                try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/${this.channel_id}`, {
                        method: "GET",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                    if (!resp.ok) {
                        const errorMsg = (await req.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json() 
                    this.channel_id = response.id
                    this.channel_name = response.channel_name
                    this.channel_owner = response.owner.username

                    this.getUser()
                    // console.log(response)
                    
                    
                } catch(error) {
                    alert(error.message)
                }
            },
            async getUser(){
                try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, {
                        method: "GET",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                    if (!resp.ok) {
                        const errorMsg = (await resp.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json() 

                    this.user_id = response.user.id

                    this.getMessage()
                    
                } catch (error) {
                    alert(error.message);
                }
            },
            async join(){
                try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-type": "application/json"
                        },
                        body: JSON.stringify({
                            pengguna_id: this.user_id,
                            channel_id: this.channel_id,
                        })
                    })

                    if(!resp.ok){
                        const errorMsg = (await resp.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json()
                    console.log(response)

                    alert("Joined succesfully")

                    this.$router.push("/browse")
                } catch(error) {
                    alert(error.message)
                }
            },
            async getMessage(){
                const query = {
                    "channel_id": {
                        equals: this.channel_id
                    },
                    
                }

                const stringifiedQuery = qs.stringify(
                    {
                        where: query,
                    },
                    {
                        addQueryPrefix: true,
                    }
                )

                try {
                        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/messages${stringifiedQuery}`, {
                            method: "GET",
                            credentials: "include",
                            headers: {
                                "Content-Type": "application/json",
                            },
                        });

                        if (!resp.ok) {
                            const errorMsg = (await resp.json())?.errors[0].message;
                            throw new Error(errorMsg);
                        }

                        const response = await resp.json() 
                        

                        let messages = []
                        response.docs.forEach(item => {
                            messages.push(item)
                        })

                        
                        
                        this.messages = messages.reverse()
                        console.log(this.intervalId)
                        
                    } catch(error) {
                        alert(error.message)
                    }
            },
            async sendMessage(){
                try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/messages`, {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-type": "application/json"
                        },
                        body: JSON.stringify({
                            pengguna_id: this.user_id,
                            channel_id: this.channel_id,
                            message: message.value
                        })
                    })

                    if(!resp.ok){
                        const errorMsg = (await resp.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json()
                    this.messages.push(response.doc)
                   

                    message.value = ''

                    
                } catch(error) {
                    alert(error.message)
                }
                
                
            },
            async changeName(){
                try {
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/${this.channel_id}`, {
                        method: "PATCH",
                        credentials: "include",
                        headers: {
                            "Content-type": "application/json"
                        },
                        body: JSON.stringify({
                            channel_name: newChannelName.value
                        })
                    })

                    if(!resp.ok){
                        const errorMsg = (await resp.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json()
                   
                    console.log(response)
                    newChannelName.value = ''

                    
                } catch(error) {
                    alert(error.message)
                }
            },
            
        },
        
        mounted(){
            
            this.getChannelInfo()
            .catch(error => {
                console.error(error);
            });
            // this.intervalId = setInterval(this.getMessage, 1000)
            
            
        },
        // beforeDestroy() {
        //     // Clear the interval when the component is destroyed to avoid memory leaks
        //     clearInterval(this.intervalId);
        // },
    }
</script>