<script setup>
</script>

<template>
    <div>
        <h1>Browse User</h1>
    </div>
    <br>
    <div v-for="(user, index) in users" :key="index" class="card">
        <div @click="goToChat(user.id)">
            {{ user.username }}
        </div>
        
    </div>
    <br>
    
</template>

<script>
    export default {
        data(){
            return {
                users: null,
            }
        },
        methods: {
            async getUsers(){
                try {
                    const resp = await fetch("http://localhost:3000/api/penggunas", {
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

                    const users = response.docs
                    
                    
                    this.users = users
                    
                    
                    
                } catch(error) {
                    alert(error.message)
                }
            },
            create(){
                this.$router.push("/create")
            },
            goToChat(user_id){
                this.$router.push(`/chat/${user_id}`)
            }
        },
        mounted(){
            this.getUsers()
            .catch(error => {
                console.log(error)
            })
        }
    }
</script>

<style>
/* Add some basic styling for the cards */
.card {
  border: 1px solid #ccc;
  padding: 10px;
  margin: 10px;
  width: 200px;
  text-align: center;
}
</style>